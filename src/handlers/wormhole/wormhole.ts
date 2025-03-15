import {
  Wormhole,
  amount,
  wormhole,
} from '@wormhole-foundation/sdk';
import evm from '@wormhole-foundation/sdk/evm';
import solana from '@wormhole-foundation/sdk/solana';
import { getTokenDecimals } from './helpers/helpers';
import { z } from 'zod';
import dotenv from 'dotenv';
dotenv.config();
import {
  toNative,
} from "@wormhole-foundation/sdk-definitions";
import { validateAddress } from '../../utils/validators';
import { capitalizeFirstLetter } from '../../utils/stringUtils';
import { ethers } from 'ethers';
import { EVM_CHAIN_IDS, getEvmProvider } from '../../utils/evm';
import { TransactionHandler, CreateTransactionResponse, BuildTransactionResponse } from "../TransactionHandler";

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

export class WormholeHandler implements TransactionHandler {
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
    try {
      params.from.chain = capitalizeFirstLetter(params.from.chain.toLowerCase());
      params.to.chain = capitalizeFirstLetter(params.to.chain.toLowerCase());

      const toNativeSenderAddress = toNative(params.from.chain, senderAddress);

      const wh = await wormhole('Mainnet', [evm, solana]);

      const sendChain = wh.getChain(params.from.chain);

      const ethUsdcCA = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'

      const token = Wormhole.tokenId(sendChain.chain, ethUsdcCA);

      const decimals = await getTokenDecimals(wh, token, sendChain);

      const parsedAmount = amount.parse(params.amount, decimals);

      const amt = amount.units(parsedAmount);

      const atb = await sendChain.getAutomaticTokenBridge();

      const relayerFee = await atb.getRelayerFee(params.to.chain, token.address);

      const minAmount = (relayerFee * 105n) / 100n;

      if (amt < minAmount) {
        throw new Error(
          `Amount too low. Minimum required: ${amount.display(amount.fromBaseUnits(minAmount, decimals))}`
        );
      }

      const transactions = [];

      const xferGenerator = atb.transfer(
        toNativeSenderAddress,
        Wormhole.chainAddress(params.to.chain, params.to.address),
        token.address,
        amt
      );

      for await (const tx of xferGenerator) {
        const rawTx = tx.transaction;
        if (Object.keys(EVM_CHAIN_IDS).find(key => key.toLowerCase() === params.from.chain.toLowerCase())) {
          const provider = getEvmProvider(params.from.chain);
          const feeData = await provider.getFeeData();
          const nonce = await provider.getTransactionCount(senderAddress, 'latest');
          const transaction = {
            to: rawTx.to,
            data: rawTx.data,
            value: rawTx.value?.toString() || '0x0',
            nonce: nonce,
            maxFeePerGas: feeData.maxFeePerGas?.toString(),
            maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.toString(),
            gasLimit: 300000n,
            type: 2,
            chainId: EVM_CHAIN_IDS[params.from.chain.toLowerCase()]
          };
          transactions.push({
            hex: ethers.Transaction.from(transaction).unsignedSerialized,
            type: 'transfer'
          });
        }
      }

      return { transactions };
    } catch (error) {
      throw error;
    }
  }
}
