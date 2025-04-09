import { z } from 'zod';
import { PublicKey } from '@solana/web3.js';
import { getMint, getAssociatedTokenAddress } from "@solana/spl-token";
import { TransactionHandler, CreateTransactionResponse, BuildTransactionResponse } from "../TransactionHandler";
import { connection, validateSolanaAddress } from '../../utils/solana';

const PayloadSchema = z.object({
  inputToken: z.string().nonempty("Missing required field: inputToken"),
  outputToken: z.string().nonempty("Missing required field: outputToken"),
  amount: z.number().positive("Amount must be a positive number"),
});

type Payload = z.infer<typeof PayloadSchema>;

export class SwapHandler implements TransactionHandler {
  private static feeAccountCache: { [tokenMint: string]: string | null } = {};

  async create(payload: Payload): Promise<CreateTransactionResponse> {
    const validation = PayloadSchema.safeParse(payload);

    if (!validation.success) {
      throw new Error(validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '));
    }

    payload = validation.data;

    validateSolanaAddress(payload.inputToken);
    validateSolanaAddress(payload.outputToken);

    return {
      chain: "solana",
      data: payload,
    };
  }

  async build(data: Payload, publicKey: string): Promise<BuildTransactionResponse> {
    const inputMint = await getMint(connection, new PublicKey(data.inputToken));
    const amount = Math.floor(data.amount * (10 ** inputMint.decimals));
    let feeAccount = undefined;
    let platformFeeBps = "";
    
    if (process.env.JUPITER_FEE_BPS && process.env.JUPITER_FEE_ACCOUNT) {
      try {
        const feeAccountPubkey = new PublicKey(process.env.JUPITER_FEE_ACCOUNT);
        
        if (data.inputToken in SwapHandler.feeAccountCache) {
          feeAccount = SwapHandler.feeAccountCache[data.inputToken] || undefined;
        } else if (data.outputToken in SwapHandler.feeAccountCache) {
          feeAccount = SwapHandler.feeAccountCache[data.outputToken] || undefined;
        } else {
          const [inputTokenAccountsResult, outputTokenAccountsResult] = await Promise.all([
            connection.getParsedTokenAccountsByOwner(feeAccountPubkey, {
              mint: new PublicKey(data.inputToken),
            }),
            connection.getParsedTokenAccountsByOwner(feeAccountPubkey, {
              mint: new PublicKey(data.outputToken),
            })
          ]);
          
          if (inputTokenAccountsResult.value.length > 0) {
            feeAccount = inputTokenAccountsResult.value[0].pubkey.toBase58();
            SwapHandler.feeAccountCache[data.inputToken] = feeAccount;
          } else if (outputTokenAccountsResult.value.length > 0) {
            feeAccount = outputTokenAccountsResult.value[0].pubkey.toBase58();
            SwapHandler.feeAccountCache[data.outputToken] = feeAccount;
          }
        }

        if (feeAccount) {
          platformFeeBps = `&platformFeeBps=${process.env.JUPITER_FEE_BPS}`;
        }
      } catch (error) {
        console.error("Error setting up fee account, skipping fee:", error);
        platformFeeBps = "";
        feeAccount = undefined;
      }
    }

    // Get quote
    const quoteResponse = await (
      await fetch(`https://quote-api.jup.ag/v6/quote?inputMint=${data.inputToken}\
&outputMint=${data.outputToken}\
&amount=${amount}\
${platformFeeBps}\
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
          feeAccount,
          wrapAndUnwrapSol: true,
          dynamicSlippage: { "maxBps": 300 },
        })
      })
    ).json();

    return {
      transactions: [{
        type: "versioned",
        base64: swapTransaction,
      }],
    };
  }
}
