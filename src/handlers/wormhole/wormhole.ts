import { z } from 'zod';
import { TransactionHandler, CreateTransactionResponse, BuildTransactionResponse } from "../TransactionHandler";
import { wormhole } from "@wormhole-foundation/sdk";
import { validateAddress } from '../../utils/validators';
import { handleTokenAmount } from "./amountHandler";
import solana from "@wormhole-foundation/sdk/solana";
import evm from "@wormhole-foundation/sdk/evm";
import sui from "@wormhole-foundation/sdk/sui";
import {
  isTokenId,
  toNative,
} from "@wormhole-foundation/sdk-definitions";
import { EVM_CHAIN_IDS } from '../../utils/evm';


const PayloadSchema = z.object({
  token: z.object({
    chain: z.string().nonempty("Missing required field: chain"),
    address: z.string().nonempty("Missing required field: address"),
  }).required(),
  amount: z.union([
    z.string().nonempty("Amount must not be empty"),
    z.number().positive("Amount must be a positive number")
  ]),
  from: z.object({
    chain: z.string().nonempty("Missing required field: chain"),
    address: z.string().nonempty("Missing required field: address"),
  }).required(),
  to: z.object({
    chain: z.string().nonempty("Missing required field: chain"),
    address: z.string().nonempty("Missing required field: address"),
  }).required(),
  nativeGas: z.union([
    z.string().nonempty("NativeGas must not be empty"),
    z.number().nonnegative("NativeGas must be a non-negative number")
  ]).optional().default("0.001"),
});

type Payload = z.infer<typeof PayloadSchema>;

export class WormholeHandler implements TransactionHandler {
  private transferData: any | null = null;
  
  async create(payload: any): Promise<CreateTransactionResponse> {
    const validation = PayloadSchema.safeParse(payload);

    if (!validation.success) {
      throw new Error(validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '));
    }

    payload.from.chain = payload.from.chain.toLowerCase();
    payload.token.chain = payload.token.chain.toLowerCase();
    payload.to.chain = payload.to.chain.toLowerCase();

    const validatedPayload = validation.data;
    validateAddress(validatedPayload.from.chain, validatedPayload.from.address);
    validateAddress(validatedPayload.token.chain, validatedPayload.token.address);
    validateAddress(validatedPayload.to.chain, validatedPayload.to.address);
    const normalizedPayload = {
      ...validatedPayload,
      amount: validatedPayload.amount.toString(),
      nativeGas: validatedPayload.nativeGas.toString(),
    };

    return {
      chain: normalizedPayload.from.chain,
      data: normalizedPayload,
    };
  }

  async build(data: any, senderAddress: string): Promise<BuildTransactionResponse> {
    if (!data) {
      throw new Error('No transfer data found. Please call create() first.');
    }
    const amount = await handleTokenAmount(data.token.chain, data.amount, data.token.address);
    console.log('Debug: from.chain =', data.from.chain);
    const transactions = [];
    const wh = await wormhole("Mainnet", [
      evm,
      solana,
      sui
    ]);
    const fromChain = await wh.getChain(data.from.chain);
    const recipient = {
      chain: data.to.chain,
      address: toNative(data.to.chain, data.to.address)
    };
    const token = isTokenId(data.token) ? data.token.address : data.token;
    const tb = await fromChain.getAutomaticTokenBridge();
    const xfer = tb.transfer(senderAddress, recipient, token, amount, data.nativeGas);
    for await (const tx of xfer) {
      console.log('tx', JSON.stringify(tx, null, 2));
      if (data.from.chain === 'solana') {
        transactions.push({
          base64: tx.toString(),
        });
      } else if (Object.keys(EVM_CHAIN_IDS).find(key => key.toLowerCase() === data.from.chain.toLowerCase())) {
        transactions.push({
          hex: tx.toString(),
          chain: "ethereum" 
        });
      } else if (data.from.chain === 'sui') {
        transactions.push({
          base64: tx.toString()
        });
      } else {
        throw new Error('Unsupported chain type');
      }
    }

    return {
      transactions,
    };
  }
}
