import { z } from 'zod';
import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';
import { TransactionHandler } from "../TransactionHandler";

const TOKEN_MINTS: Record<string, string> = {
  'SOL': 'So11111111111111111111111111111111111111112',
  'JLP': '27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4',
};

const PayloadSchema = z.object({
  inputToken: z.string().nonempty("Missing required field: inputToken"),
  outputToken: z.string().nonempty("Missing required field: outputToken"),
  amount: z.number().positive("Amount must be a positive number"),
});

type Payload = z.infer<typeof PayloadSchema>;

interface Data {
  inputToken: string;
  outputToken: string;
  amount: number;
}

async function getTokenPrecision(connection: Connection, tokenAddress: string) {
  const mint = await connection.getParsedAccountInfo(
    new PublicKey(tokenAddress)
  );
  if (!mint.value) {
    throw new Error(`Token address ${tokenAddress} not found`);
  }
  const accountData = mint.value.data;
  if (!('parsed' in accountData)) {
    throw new Error(`Parsed data not found for token address ${tokenAddress}`);
  }
  return accountData.parsed.info.decimals;
}

async function getTokenInfo(connection: Connection, token: string) {
  if (!TOKEN_MINTS[token]) {
    throw new Error(`Token ${token} not supported`);
  }
  const mint = TOKEN_MINTS[token];
  if (token === 'SOL') {
    return {
      mint,
      decimals: 9,
    };
  }
  const decimals = await getTokenPrecision(connection, mint);
  return {
    mint,
    decimals,
  };
}

export class SwapHandler implements TransactionHandler {
  async create(payload: Payload): Promise<{ data?: Data, error?: string }> {
    const validation = PayloadSchema.safeParse(payload);

    if (!validation.success) {
      return { 
        error: validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ') 
      };
    }

    const connection = new Connection(process.env.SOLANA_RPC_URL || clusterApiUrl('mainnet-beta'), 'confirmed');

    let inputTokenInfo, outputTokenInfo;
    try {
      inputTokenInfo = await getTokenInfo(connection, payload.inputToken);
      outputTokenInfo = await getTokenInfo(connection, payload.outputToken);
    } catch (error) {
      return { error: (error as Error).message };
    }

    return { data: {
      inputToken: inputTokenInfo.mint,
      outputToken: outputTokenInfo.mint,
      amount: payload.amount * (10 ** inputTokenInfo.decimals),
    } };
  }

  async build(data: Payload, publicKey: string): Promise<string> {
    // Get quote
    const quoteResponse = await (
      await fetch(`https://quote-api.jup.ag/v6/quote?inputMint=${data.inputToken}\
&outputMint=${data.outputToken}\
&amount=${data.amount}\
&slippageBps=50`)
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
          wrapAndUnwrapSol: true
        })
      })
    ).json();

    return swapTransaction;
  }
}
