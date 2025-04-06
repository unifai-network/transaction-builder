import { z } from "zod";
import { TransactionHandler, CreateTransactionResponse, BuildTransactionResponse } from "../../TransactionHandler";
import { connection } from "../../../utils/solana";
import { BN } from "bn.js";
import { PublicKey } from "@solana/web3.js";
import DLMM, { ActivationType, deriveCustomizablePermissionlessLbPair, LBCLMM_PROGRAM_IDS } from "@meteora-ag/dlmm";
import { getMint } from "@solana/spl-token";
import { prepareTransactions } from "../utils";

const PayloadSchema = z.object({
  baseMint: z.string().nonempty(),
  quoteMint: z.string().nonempty(),
  binStep: z.number(),
  feeBps: z.number(),
  initialPrice: z.number(),
  priceRoundingUp: z.boolean().optional(),
  activationType: z.nativeEnum(ActivationType).optional(),
  activationPoint: z.number().optional(),
  hasAlphaVault: z.boolean().optional(),
});

type Payload = z.infer<typeof PayloadSchema>;

export class MeteoraDlmmCreateCustomizablePoolHandler implements TransactionHandler {
  async create(payload: Payload): Promise<CreateTransactionResponse> {
    const validation = PayloadSchema.safeParse(payload);

    if (!validation.success) {
      throw new Error(validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '));
    }

    payload = validation.data;

    await createTransaction(payload, PublicKey.unique());

    return {
      chain: "solana",
      data: payload,
    };
  }

  async build(data: Payload, publicKey: string): Promise<BuildTransactionResponse> {
    const tx = await createTransaction(data, new PublicKey(publicKey));

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

async function createTransaction(data: Payload, publicKey: PublicKey) {
  const [baseMint, quoteMint] = [new PublicKey(data.baseMint), new PublicKey(data.quoteMint)];
  const [baseDecimals, quoteDecimals] = await Promise.all([
    getMint(connection, baseMint).then(mint => mint.decimals),
    getMint(connection, quoteMint).then(mint => mint.decimals),
  ]);

  const initPrice = DLMM.getPricePerLamport(
    baseDecimals,
    quoteDecimals,
    data.initialPrice,
  );

  const activateBinId = DLMM.getBinIdFromPrice(
    initPrice,
    data.binStep,
    data.priceRoundingUp ?? true,
  );

  return await DLMM.createCustomizablePermissionlessLbPair(
    connection,
    new BN(data.binStep),
    baseMint,
    new PublicKey(data.quoteMint),
    new BN(activateBinId),
    new BN(data.feeBps),
    data.activationType ?? ActivationType.Timestamp,
    data.hasAlphaVault ?? false,
    publicKey,
    data.activationPoint ? new BN(data.activationPoint) : undefined,
    true,
    {
      cluster: 'mainnet-beta',
    },
  );
}
