import { z } from 'zod';
import { TransactionHandler, CreateTransactionResponse, BuildTransactionResponse } from "../TransactionHandler";
import { suiClient, validateSuiAddress, validateSuiCoinType } from '../../utils/sui'
import { Transaction } from '@mysten/sui/transactions'
import { AggregatorClient, Env } from '@cetusprotocol/aggregator-sdk'

const PayloadSchema = z.object({
  from: z.string().nonempty("Missing required field: from"),
  target: z.string().nonempty("Missing required field: target"),
  amount: z.number().positive("Amount must be a positive number"),
  slippage: z.number().min(0).max(1).default(0.005), // 0.5%
});

type Payload = z.infer<typeof PayloadSchema>;

export class SwapHandler implements TransactionHandler {
  async create(payload: Payload): Promise<CreateTransactionResponse> {
    const validation = PayloadSchema.safeParse(payload);

    if (!validation.success) {
      throw new Error(validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '));
    }

    payload = validation.data;

    await validateSuiCoinType(payload.from);
    await validateSuiCoinType(payload.target);

    return {
      chain: "sui",
      data: {
        from: payload.from,
        target: payload.target,
        amount: payload.amount,
      },
    };
  }

  async build(data: Payload, wallet: string): Promise<BuildTransactionResponse> {
    validateSuiAddress(wallet);
    const cetusClient = new AggregatorClient(undefined, wallet, suiClient, Env.Mainnet)

    const fromCoinMetadata = await suiClient.getCoinMetadata({
      coinType: data.from,
    })

    if (!fromCoinMetadata) {
      throw new Error(`Coin metadata not found for ${data.from}`);
    }

    const amount = (data.amount * (10 ** fromCoinMetadata.decimals)).toFixed(0);

    // true means fix input amount, false means fix output amount, default use true.
    const byAmountIn = true;

    const routerRes = await cetusClient.findRouters({
      from: data.from,
      target: data.target,
      amount,
      byAmountIn,
    })

    if (!routerRes) {
      throw new Error(`No router found for ${data.from} to ${data.target}`);
    }

    const txb = new Transaction()

    await cetusClient.fastRouterSwap({
      routers: routerRes,
      slippage: data.slippage,
      txb,
      refreshAllCoins: true,
    })

    txb.setSender(wallet)

    const txBytes = await txb.build({
      client: suiClient
    })

    const txBase64 = Buffer.from(txBytes).toString('base64')

    return {
      transactions: [{
        base64: txBase64,
      }],
    };
  }
}
