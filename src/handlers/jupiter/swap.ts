import { z } from 'zod';
import { Connection, clusterApiUrl, PublicKey } from '@solana/web3.js';
import { getMint } from "@solana/spl-token";
import { TransactionHandler } from "../TransactionHandler";
import { validateTokenAddress } from '../../utils';

const PayloadSchema = z.object({
  inputToken: z.string().nonempty("Missing required field: inputToken"),
  outputToken: z.string().nonempty("Missing required field: outputToken"),
  amount: z.number().positive("Amount must be a positive number"),
});

type Payload = z.infer<typeof PayloadSchema>;

const connection = new Connection(process.env.SOLANA_RPC_URL || clusterApiUrl('mainnet-beta'), 'confirmed');

export class SwapHandler implements TransactionHandler {
  async create(payload: Payload): Promise<{ data?: Payload, error?: string }> {
    const validation = PayloadSchema.safeParse(payload);

    if (!validation.success) {
      return {
        error: validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
      };
    }

    let inputMint;
    try {
      validateTokenAddress(payload.inputToken);
      validateTokenAddress(payload.outputToken);
      inputMint = await getMint(connection, new PublicKey(payload.inputToken));
    } catch (error) {
      return { error: (error as Error).message };
    }

    return {
      data: {
        inputToken: payload.inputToken,
        outputToken: payload.outputToken,
        amount: payload.amount * (10 ** inputMint.decimals),
      },
    };
  }

  async build(data: Payload, publicKey: string): Promise<string> {
    // Get quote
    const quoteResponse = await (
      await fetch(`https://quote-api.jup.ag/v6/quote?inputMint=${data.inputToken}\
&outputMint=${data.outputToken}\
&amount=${data.amount}\
&slippageBps=300`)
    ).json();

    // Get swap transaction
    const { swapTransaction } = await (
      await fetch('https://quote-api.jup.ag/v6/swap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          quoteResponse,
          userPublicKey: publicKey,
          wrapAndUnwrapSol: true,
          dynamicSlippage: { "maxBps": 300 },
        })
      })
    ).json();

    return swapTransaction;
  }
}
