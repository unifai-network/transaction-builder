import { z } from "zod";
import { TransactionHandler, CreateTransactionResponse, BuildTransactionResponse } from "../../TransactionHandler";
import { AmmImpl, PROGRAM_ID } from "@mercurial-finance/dynamic-amm-sdk";
import { connection } from "../../../utils/solana";
import { BN } from "bn.js";
import { PublicKey } from "@solana/web3.js";
import { ActivationType } from "@mercurial-finance/dynamic-amm-sdk/dist/cjs/src/amm/types";
import { getMint } from "@solana/spl-token";
import { prepareTransactions, toRawAmount } from "../utils";
import { deriveCustomizablePermissionlessConstantProductPoolAddress } from "@mercurial-finance/dynamic-amm-sdk/dist/cjs/src/amm/utils";

const PayloadSchema = z.object({
  baseMint: z.string().nonempty(),
  quoteMint: z.string().nonempty(),
  baseAmount: z.number().positive(),
  quoteAmount: z.number().positive(),
  feeBps: z.number(),
  activationType: z.nativeEnum(ActivationType).optional(),
  activationPoint: z.number().optional(),
  hasAlphaVault: z.boolean().optional(),
});

type Payload = z.infer<typeof PayloadSchema>;

export class MeteoraDynamicCreateCustomizablePoolHandler implements TransactionHandler {
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

    const poolAddress = deriveCustomizablePermissionlessConstantProductPoolAddress(
      new PublicKey(data.baseMint),
      new PublicKey(data.quoteMint),
      new PublicKey(PROGRAM_ID),
    );

    return {
      transactions: [{
        type: "legacy",
        base64: tx.serialize({
          requireAllSignatures: false,
        }).toString('base64'),
      }],
      poolAddress
    };
  }
}

async function createTransaction(data: Payload, publicKey: PublicKey) {
  const baseMint = new PublicKey(data.baseMint);
  const quoteMint = new PublicKey(data.quoteMint);

  const [baseDecimals, quoteDecimals] = await Promise.all([
    getMint(connection, baseMint).then(mint => mint.decimals),
    getMint(connection, quoteMint).then(mint => mint.decimals),
  ]);

  const baseAmount = toRawAmount(
    data.baseAmount,
    baseDecimals,
  );
  const quoteAmount = toRawAmount(
    data.quoteAmount,
    quoteDecimals,
  );

  return await AmmImpl.createCustomizablePermissionlessConstantProductPool(
    connection,
    new PublicKey(publicKey),
    baseMint,
    quoteMint,
    baseAmount,
    quoteAmount,
    {
      tradeFeeNumerator: data.feeBps,
      activationType: data.activationType ?? ActivationType.Timestamp as number,
      activationPoint: data.activationPoint ? new BN(data.activationPoint) : null,
      hasAlphaVault: data.hasAlphaVault ?? false,
      padding: Array(90).fill(0),
    },
    {
      cluster: 'mainnet-beta'
    }
  );
}