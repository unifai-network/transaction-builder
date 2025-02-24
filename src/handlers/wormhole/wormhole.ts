import { z } from 'zod';
import { TransactionHandler, CreateTransactionResponse, BuildTransactionResponse } from "../TransactionHandler";
import { wormhole } from "@wormhole-foundation/sdk";
import { validateAddress } from '../../utils/validators';
import { handleTokenAmount } from "./amountHandler";
import solana from "@wormhole-foundation/sdk/solana";
import evm from "@wormhole-foundation/sdk/evm";
import sui from "@wormhole-foundation/sdk/sui";
import { Wormhole } from "@wormhole-foundation/sdk-connect";
import {
  isTokenId,
  toNative,
} from "@wormhole-foundation/sdk-definitions";
import { EVM_CHAIN_IDS } from '../../utils/evm';
import { capitalizeFirstLetter } from '../../utils/stringUtils';


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
    const validatedPayload = validation.data;
    validateAddress(validatedPayload.from.chain, validatedPayload.from.address);
    validateAddress(validatedPayload.token.chain, validatedPayload.token.address);
    validateAddress(validatedPayload.to.chain, validatedPayload.to.address);
    validatedPayload.from.chain = capitalizeFirstLetter(validatedPayload.from.chain.toLowerCase());
    validatedPayload.token.chain = capitalizeFirstLetter(validatedPayload.token.chain.toLowerCase());
    validatedPayload.to.chain = capitalizeFirstLetter(validatedPayload.to.chain.toLowerCase());
    console.log(validatedPayload);
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
    console.log('Debug: token.chain =', data.token.chain);
    const transactions = [];
    const wh = await wormhole("Mainnet", [
      evm,
      solana,
      sui
    ]);
    console.log('data.from.chain', data.from.chain);
    const fromChain = await wh.getChain(data.from.chain);
    // const token = isTokenId(data.token) ? data.token.address : data.token;
    const tb = await fromChain.getAutomaticTokenBridge();
    const senderAddress1 = toNative(data.from.chain, senderAddress);
    const recipient = Wormhole.chainAddress(data.to.chain, data.to.address);
    const token = Wormhole.chainAddress(data.token.chain, data.token.address);
    console.log('1 ————————————', senderAddress1, recipient, token, amount, data.nativeGas);
    const xfer = tb.transfer(senderAddress1, recipient, token, amount, data.nativeGas);
    console.log('2 ————————————', JSON.stringify(xfer, null, 2));
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
