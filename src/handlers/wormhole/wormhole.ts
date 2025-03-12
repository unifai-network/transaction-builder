import {
  amount,
  wormhole,
  toUniversal,
  circle,
} from '@wormhole-foundation/sdk';
import evm from '@wormhole-foundation/sdk/evm';
import solana from '@wormhole-foundation/sdk/solana';
import { z } from 'zod';
import dotenv from 'dotenv';
import { TransactionHandler, CreateTransactionResponse, BuildTransactionResponse } from "../TransactionHandler";
import { validateAddress } from '../../utils/validators';
import { capitalizeFirstLetter } from '../../utils/stringUtils';
import type { Chain, Network } from "@wormhole-foundation/sdk-base";
import { ethers } from "ethers";
dotenv.config();
const PayloadSchema = z.object({
  amount: z.union([
    z.string().nonempty("Amount must not be empty"),
    z.number().positive("Amount must be a positive number")
  ]),
  from: z.object({
    chain: z.string()
      .nonempty("Missing required field: chain")
      .refine(
        (chain) => ['ethereum', 'eth', 'base'].includes(chain.toLowerCase()),
        "From chain must be Ethereum or Base"
      ),
    address: z.string().nonempty("Missing required field: address"),
  }).required(),
  to: z.object({
    chain: z.string()
      .nonempty("Missing required field: chain")
      .refine(
        (chain) => ['solana', 'sol'].includes(chain.toLowerCase()),
        "To chain must be Solana"
      ),
    address: z.string().nonempty("Missing required field: address"),
  }).required()
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
    };
    return {
      chain: normalizedPayload.from.chain,
      data: normalizedPayload,
    };
  }

  async build(params: any, senderAddress: string): Promise<BuildTransactionResponse> {
    // Normalize chain names
    params.from.chain = capitalizeFirstLetter(params.from.chain.toLowerCase());
    params.to.chain = capitalizeFirstLetter(params.to.chain.toLowerCase());

    const wh = await wormhole('Mainnet', [evm, solana], {
      chains: {
        Solana: {
          rpc: process.env.SOL_RPC || "https://api.mainnet-beta.solana.com",
        },
        Ethereum: {
          rpc: process.env.ETH_RPC || "https://ethereum.publicnode.com",
        },
        Base: {
          rpc: process.env.BASE_RPC || "https://mainnet.base.org",
        }
      }
    });

    // Verify if chains support Circle
    if (
      !circle.isCircleChain('Mainnet', params.from.chain as Chain) ||
      !circle.isCircleChain('Mainnet', params.to.chain as Chain)
    ) {
      throw new Error(`Chain not supported: ${params.from.chain} or ${params.to.chain}`);
    }

    // Convert amount (6 decimal places)
    const amt = amount.units(amount.parse(params.amount, 6));

    // Generate unsigned transaction
    const transactions: { base64?: string; hex?: string;[key: string]: any }[] = [];
    let relayerFee: bigint;
    let redeemableAmount: bigint;
    // Use getAutomaticCircleBridge for EVM chains
    const fromChain = wh.getChain(params.from.chain);
    const cr = await fromChain.getAutomaticCircleBridge();

    // Get relayer fee
    relayerFee = await cr.getRelayerFee(params.to.chain as Chain);

    // Validate amount
    const minAmount = (relayerFee * 105n) / 100n; // Add 5% buffer
    if (amt < minAmount) {
      throw new Error(`Transfer amount (${amt}) must be greater than minimum required amount (${minAmount})`);
    }

    // Calculate redeemable amount
    redeemableAmount = amt - relayerFee;

    // Generate transaction
    for await (const tx of cr.transfer(
      senderAddress,
      {
        chain: params.to.chain,
        address: toUniversal(params.to.chain, params.to.address)
      },
      amt,
      0n // Do not use native gas
    )) {
      const txWithoutFrom = tx.transaction;
      if ('from' in txWithoutFrom) {
        delete txWithoutFrom.from;
      }

      const serializedTx = ethers.Transaction.from({
        ...txWithoutFrom,
        type: 2, // EIP-1559
      }).unsignedSerialized;

      transactions.push({ hex: serializedTx });
    }
    return {
      transactions,
      metadata: {
        fromChain: params.from.chain,
        toChain: params.to.chain,
        amount: amt.toString(),
      }
    };
  }
  isEvmChain(chain: string) {
    const EVM_CHAIN_IDS: Record<string, number> = {
      'eth': 1,
      'ethereum': 1,
      'base': 8453,
    };
    return Object.keys(EVM_CHAIN_IDS).find(key => key.toLowerCase() === chain.toLowerCase());
  }
}


