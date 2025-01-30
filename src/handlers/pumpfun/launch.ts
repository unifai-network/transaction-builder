import { z } from "zod";
import { TransactionHandler } from "../TransactionHandler";
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
  async create(payload: Payload): Promise<{ data?: Payload, error?: string }> {
    const validation = PayloadSchema.safeParse(payload);

    if (!validation.success) {
      return {
        error: validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
      };
    }

    return {
      data: payload,
    };
  }

  async build(data: Payload, publicKey: string): Promise<{ chain: string, base64: string, type?: string }> {
    const txn = await launchPumpFunToken(publicKey, data.tokenName, data.tokenTicker, data.description, data.imageUrl, data);
    return {
      chain: "solana",
      type: "versioned",
      base64: txn,
    };
  }
}
