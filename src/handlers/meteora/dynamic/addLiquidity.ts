import { z } from "zod";
import { TransactionHandler, CreateTransactionResponse, BuildTransactionResponse } from "../../TransactionHandler";
import { connection } from "../../../utils/solana";
import { PublicKey } from "@solana/web3.js";
import { prepareTransactions, toRawAmount, toUiAmount } from "../utils";
import AmmImpl from "@mercurial-finance/dynamic-amm-sdk";
import BN from "bn.js";

const PayloadSchema = z.object({
  poolAddress: z.string().nonempty(),
  baseAmount: z.number(),
  quoteAmount: z.number(),
  fixSide: z.enum(["base", "quote"]),
  slippage: z.number()
});

type Payload = z.infer<typeof PayloadSchema>;

export class MeteoraDynamicAddLiquidityHandler implements TransactionHandler {
  async create(payload: Payload): Promise<CreateTransactionResponse> {
    const validation = PayloadSchema.safeParse(payload);

    if (!validation.success) {
      throw new Error(validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '));
    }

    payload = validation.data;

    const amm = await AmmImpl.create(connection, new PublicKey(payload.poolAddress));

    let baseAmount = toRawAmount(payload.baseAmount, amm.tokenAMint.decimals);
    let quoteAmount = toRawAmount(payload.quoteAmount, amm.tokenBMint.decimals);

    if (!amm.isStablePool && !amm.poolState.lpSupply.isZero()) {
      if (payload.fixSide === 'base') {
        quoteAmount = new BN(0);
      } else {
        baseAmount = new BN(0);
      }
    }

    const quote = amm.getDepositQuote(baseAmount, quoteAmount, true, payload.slippage);

    const tokenAInAmount = toUiAmount(quote.tokenAInAmount, amm.tokenAMint.decimals);
    const tokenBInAmount = toUiAmount(quote.tokenBInAmount, amm.tokenBMint.decimals);
    const minPoolTokenAmountOut = toUiAmount(quote.minPoolTokenAmountOut, amm.decimals);

    await amm.deposit(PublicKey.unique(), quote.tokenAInAmount, quote.tokenBInAmount, amm.isStablePool ? quote.minPoolTokenAmountOut : quote.poolTokenAmountOut);

    return {
      chain: "solana",
      data: payload,
      quote: {
        baseTokenInAmount: tokenAInAmount,
        quoteTokenInAmount: tokenBInAmount,
        minLpTokenAmountOut: minPoolTokenAmountOut,
      }
    };
  }

  async build(data: Payload, publicKey: string): Promise<BuildTransactionResponse> {
    const amm = await AmmImpl.create(connection, new PublicKey(data.poolAddress));

    let baseAmount = toRawAmount(data.baseAmount, amm.tokenAMint.decimals);
    let quoteAmount = toRawAmount(data.quoteAmount, amm.tokenBMint.decimals);

    if (!amm.isStablePool && !amm.poolState.lpSupply.isZero()) {
      if (data.fixSide === 'base') {
        quoteAmount = new BN(0);
      } else {
        baseAmount = new BN(0);
      }
    }

    const quote = amm.getDepositQuote(baseAmount, quoteAmount, true, data.slippage);

    const tx = await amm.deposit(new PublicKey(publicKey), quote.tokenAInAmount, quote.tokenBInAmount, amm.isStablePool ? quote.minPoolTokenAmountOut : quote.poolTokenAmountOut);

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
