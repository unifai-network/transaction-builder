import {
  Wormhole,
  amount,
  wormhole,
  toUniversal
} from '@wormhole-foundation/sdk';
import evm from '@wormhole-foundation/sdk/evm';
import solana from '@wormhole-foundation/sdk/solana';
import { bigint, z } from 'zod';
import dotenv from 'dotenv';
import { TransactionHandler, CreateTransactionResponse, BuildTransactionResponse } from "../TransactionHandler";
import { validateAddress } from '../../utils/validators';
import { capitalizeFirstLetter } from '../../utils/stringUtils';
import type {
  UnsignedTransaction,
} from "@wormhole-foundation/sdk-definitions";
import type { Chain, Network } from "@wormhole-foundation/sdk-base";
import { EVM_CHAIN_IDS } from '../../utils/evm';
import { ethers  } from "ethers";

dotenv.config();

const PayloadSchema = z.object({
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
  
    // Only support evm though
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
        const cr = await fromChain.getAutomaticCircleBridge();
      
        UnsignedTxs = cr.transfer(
          params.from.address,
          { 
            chain: params.to.chain, 
            address: toUniversal(params.to.chain, params.to.address)
          },
          amt,
          BigInt(params.nativeGas)
        );
        const transactions: { base64?: string; hex?: string; [key: string]: any }[] = [];
        
        for await (const tx of UnsignedTxs) {
          const txWithoutFrom = tx.transaction;
          console.log('tx',tx);
          if ('from' in txWithoutFrom) {
            delete txWithoutFrom.from;
          }
          transactions.push({ hex: ethers.Transaction.from(txWithoutFrom).unsignedSerialized });
        }
        console.log('transactions__',transactions);
        return { transactions };
      } catch (error) {
        console.error('Wormhole transfer error:', error);
        throw error;
      }
    }
  
    isEvmChain(chain: string) {
      return Object.keys(EVM_CHAIN_IDS).find(key => key.toLowerCase() === chain.toLowerCase());
    }

}

  
