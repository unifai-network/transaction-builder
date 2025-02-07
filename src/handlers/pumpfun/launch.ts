import { z } from "zod";
import { TransactionHandler, CreateTransactionResponse, BuildTransactionResponse } from "../TransactionHandler";
import { launchPumpFunToken } from "./pumpfun";

const PayloadSchema = z.object({
  tokenName: z.string().nonempty("Missing required field: tokenName"),
  tokenTicker: z.string().nonempty("Missing required field: tokenTicker"), 
  description: z.string().nonempty("Missing required field: description"),
  imageUrl: z.string().nonempty("Missing required field: imageUrl"),
  twitter: z.string().optional(),
  telegram: z.string().optional(),
  website: z.string().optional(),
  initialLiquiditySOL: z.number().optional(),
  slippageBps: z.number().optional(),
  priorityFee: z.number().optional(),
});

type Payload = z.infer<typeof PayloadSchema>;

export class PumpFunLaunchHandler implements TransactionHandler {
  async create(payload: Payload): Promise<CreateTransactionResponse> {
    const validation = PayloadSchema.safeParse(payload);

    if (!validation.success) {
      throw new Error(validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '));
    }

    payload = validation.data;

    return {
      chain: "solana",
      data: payload,
    };
  }

  async build(data: Payload, publicKey: string): Promise<BuildTransactionResponse> {
    const txn = await launchPumpFunToken(publicKey, data.tokenName, data.tokenTicker, data.description, data.imageUrl, data);
    return {
      transactions: [{
        type: "versioned",
        base64: txn,
      }],
    };
  }
}
