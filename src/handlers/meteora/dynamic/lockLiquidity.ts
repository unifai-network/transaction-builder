import { z } from "zod";
import { TransactionHandler, CreateTransactionResponse, BuildTransactionResponse } from "../../TransactionHandler";
import { connection } from "../../../utils/solana";
import { PublicKey } from "@solana/web3.js";
import { getMint } from "@solana/spl-token";
import { prepareTransactions, toRawAmount } from "../utils";
import AmmImpl from "@mercurial-finance/dynamic-amm-sdk";

const PayloadSchema = z.object({
  poolAddress: z.string().nonempty(),
  lpAmount: z.number().positive(),
});

type Payload = z.infer<typeof PayloadSchema>;

export class MeteoraDynamicLockLiquidityHandler implements TransactionHandler {
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

    return {
      transactions: [{
        type: "legacy",
        base64: tx.serialize({
          requireAllSignatures: false,
        }).toString('base64'),
      }],
    };
  }
}

async function createTransaction(data: Payload, publicKey: PublicKey) {
  const amm = await AmmImpl.create(connection, new PublicKey(data.poolAddress));

  const lpDecimals = await getMint(connection, amm.poolState.lpMint).then(mint => mint.decimals)

  const amount = toRawAmount(
    data.lpAmount,
    lpDecimals,
  );

  return await amm.lockLiquidity(new PublicKey(publicKey), amount);
}