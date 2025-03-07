import {
  Wormhole,
  amount,
  wormhole,
  UniversalAddress
} from '@wormhole-foundation/sdk';
import evm from '@wormhole-foundation/sdk/evm';
import solana from '@wormhole-foundation/sdk/solana';
import { z } from 'zod';
import dotenv from 'dotenv';
dotenv.config();
import { TransactionHandler, CreateTransactionResponse, BuildTransactionResponse } from "../TransactionHandler";
import { validateAddress } from '../../utils/validators';
import { capitalizeFirstLetter } from '../../utils/stringUtils';
import type {
  UnsignedTransaction,
} from "@wormhole-foundation/sdk-definitions";
import type { Chain, Network } from "@wormhole-foundation/sdk-base";
// evm
import { EVM_CHAIN_IDS } from '../../utils/evm';


const PayloadSchema = z.object({
  // token: z.object({
  //   chain: z.string().nonempty("Missing required field: chain"),
  //   address: z.string().nonempty("Missing required field: address"),
  // }).required(),
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
    validateAddress(validatedPayload.to.chain, validatedPayload.to.address);
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

  async build(params: any, senderAddress: string): Promise<BuildTransactionResponse> {
    try {
      params.from.chain = capitalizeFirstLetter(params.from.chain.toLowerCase());
      params.to.chain = capitalizeFirstLetter(params.to.chain.toLowerCase());

      const wh = await wormhole('Mainnet', [evm, solana]);

      const source = {
        chain: params.from.chain,
        address: Wormhole.chainAddress(params.from.chain, params.from.address),
      }

      let UnsignedTxs: AsyncGenerator<UnsignedTransaction<'Mainnet'>>;
      const amt = amount.units(amount.parse(params.amount, 6));    
      const fromChain = wh.getChain(params.from.chain);
      console.log('fromChain',fromChain);
      const cr = await fromChain.getAutomaticCircleBridge();
      console.log('UnsignedTxs___1___', source.address,
        { 
          chain: source.chain, 
          address: new UniversalAddress(params.to.address) 
        },
        amt,);
      UnsignedTxs = cr.transfer(
        source.address,
        { 
          chain: source.chain, 
          address: new UniversalAddress(params.to.address) 
        },
        amt,
  
      );
      const transactions: { base64?: string; hex?: string; [key: string]: any }[] = [];
      for await (const tx of UnsignedTxs) {
        const convertedTx = this.convertTransaction(tx);
        console.log('convertedTx___2___',convertedTx);
        transactions.push(convertedTx);
      }
      return { transactions };
    } catch (error) {
      console.error('Wormhole transfer error:', error);
      throw error;
    }
  }

  isEvmChain(chain: string) {
    return Object.keys(EVM_CHAIN_IDS).find(key => key.toLowerCase() === chain.toLowerCase());
  }

  convertTransaction<C extends Chain = Chain>(tx: UnsignedTransaction<'Mainnet', C>): { base64?: string; hex?: string; [key: string]: any } {
    return {
      base64: this.encodeTransactionToBase64(tx.transaction), 
      hex: this.encodeTransactionToHex(tx.transaction),       
      network: tx.network,                               
      chain: tx.chain,                                   
      description: tx.description,                       
      parallelizable: tx.parallelizable,                 
    };
  }

  encodeTransactionToBase64(transaction: any): string {
    if (Buffer.isBuffer(transaction) || transaction instanceof Uint8Array) {
      return Buffer.from(transaction).toString("base64");
    }
    return Buffer.from(JSON.stringify(transaction)).toString("base64");
  }
  
  encodeTransactionToHex(transaction: any): string {
    if (Buffer.isBuffer(transaction) || transaction instanceof Uint8Array) {
      return Buffer.from(transaction).toString("hex");
    }
    return Buffer.from(JSON.stringify(transaction)).toString("hex");
  }
}