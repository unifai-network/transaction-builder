
import { z } from 'zod';
import dotenv from 'dotenv';
dotenv.config();
import { ethers } from 'ethers';
import { EVM_CHAIN_IDS, getEvmProvider } from '../../../utils/evm';
import { TransactionHandler, CreateTransactionResponse, BuildTransactionResponse } from "../../TransactionHandler";
import {OKXBridge}  from './bridge';

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
  }).required()
});

export class OkxBridgeHandler implements TransactionHandler {
  async create(payload: any): Promise<CreateTransactionResponse> {
    const validation = PayloadSchema.safeParse(payload);
    if (!validation.success) {
      throw new Error(validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '));
    }
    const validatedPayload = validation.data;

    const normalizedPayload = {
      ...validatedPayload,
      amount: validatedPayload.amount.toString(),
    };
    return {
      chain: normalizedPayload.from.chain,
      data: normalizedPayload,
    };
  }

  async build(params: any, senderAddress: string): Promise<BuildTransactionResponse> {
    try {
    const transactions = await OKXBridge(params, senderAddress)
    return transactions;
    } catch (error) {
      throw error;
    }
  }
}
