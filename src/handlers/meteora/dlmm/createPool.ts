import { z } from "zod";
import { TransactionHandler, CreateTransactionResponse, BuildTransactionResponse } from "../../TransactionHandler";
import { connection } from "../../../utils/solana";
import { BN } from "bn.js";
import { PublicKey } from "@solana/web3.js";
import DLMM, { deriveCustomizablePermissionlessLbPair, LBCLMM_PROGRAM_IDS } from "@meteora-ag/dlmm";
import { getMint } from "@solana/spl-token";
import { prepareTransactions } from "../utils";

const PayloadSchema = z.object({
  baseMint: z.string().nonempty(),
  quoteMint: z.string().nonempty(),
  binStep: z.number(),
  feeBps: z.number(),
  initialPrice: z.number(),
});

type Payload = z.infer<typeof PayloadSchema>;

export class MeteoraDlmmCreatePoolHandler implements TransactionHandler {
  async create(payload: Payload): Promise<CreateTransactionResponse> {
    const validation = PayloadSchema.safeParse(payload);

    if (!validation.success) {
      throw new Error(validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '));
    }

    payload = validation.data;

    await createTransactions(payload, PublicKey.unique());

    return {
      chain: "solana",
      data: payload,
    };
  }

  async build(data: Payload, publicKey: string): Promise<BuildTransactionResponse> {
    const tx = await createTransactions(data, new PublicKey(publicKey));

    await prepareTransactions([tx], new PublicKey(publicKey));

    const [lbPair] = deriveCustomizablePermissionlessLbPair(
      new PublicKey(data.baseMint),
      new PublicKey(data.quoteMint),
      new PublicKey(LBCLMM_PROGRAM_IDS["mainnet-beta"]),
    );

    return {
      transactions: [{
        type: "legacy",
        base64: tx.serialize({
          requireAllSignatures: false,
        }).toString('base64'),
      }],
      lbPair,
    };
  }
}

async function createTransactions(data: Payload, publicKey: PublicKey) {
  const [baseDecimals, quoteDecimals] = await Promise.all([
    getMint(connection, new PublicKey(data.baseMint)).then(mint => mint.decimals),
    getMint(connection, new PublicKey(data.quoteMint)).then(mint => mint.decimals),
  ]);

  const initPrice = DLMM.getPricePerLamport(
    baseDecimals,
    quoteDecimals,
    data.initialPrice,
  );

  const activeBinId = DLMM.getBinIdFromPrice(
    initPrice,
    data.binStep,
    true,
  );

  const presetParameters = await getFeeBps2BinStepMap();
  const preset = presetParameters?.[data.feeBps]?.[data.binStep];

  if (!preset) {
    throw new Error("Invalid binStep and feeBps.")
  }

  return await DLMM.createLbPair(
    connection,
    publicKey,
    new PublicKey(data.baseMint),
    new PublicKey(data.quoteMint),
    new BN(data.binStep),
    new BN(preset.baseFactor),
    preset.publicKey,
    new BN(activeBinId),
    {
      cluster: 'mainnet-beta'
    }
  )
}

async function getFeeBps2BinStepMap() {
  const presetParameters = await DLMM.getAllPresetParameters(connection, { cluster: 'mainnet-beta' });
  return presetParameters.reduce((map, acc) => {
    const { account: { binStep, baseFactor }, publicKey } = acc;
    const { baseFeeRatePercentage } = DLMM.calculateFeeInfo(baseFactor, binStep);
    const feeBps = baseFeeRatePercentage.mul(100).toNumber();
    if (map[feeBps]) {
      map[feeBps][binStep] = { publicKey, baseFactor };
    } else {
      map[feeBps] = { [binStep]: { publicKey, baseFactor } };
    }
    return map;
  }, {} as Record<number, Record<number, { publicKey: PublicKey, baseFactor: number }>>);
}
