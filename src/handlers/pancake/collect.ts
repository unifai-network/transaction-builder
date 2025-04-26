import { z } from 'zod';
import { ethers } from 'ethers';

import {
  TransactionHandler,
  CreateTransactionResponse,
  BuildTransactionResponse,
} from '../TransactionHandler';
import {
  validateEvmAddress,
  validateEvmChain,
  EVM_CHAIN_IDS,
  getEvmProvider,
  getTokenDecimals,
  parseUnits,
} from '../../utils/evm';
import { PancakeService } from './src/service';
import { AddLiquidityParams, RemoveLiquidityParams, StakeParams, FEE_TIERS } from './src/types';

const PayloadSchema = z.object({
  chain: z.string().nonempty('Missing required field: chain'),
  tokenId: z.string().nonempty('Missing required field: tokenId'),
  amount0Max: z.union([
    z.string().optional(),
    z.number().positive('Amount0Max must be positive'),
  ]),
  amount1Max: z.union([
    z.string().optional(),
    z.number().positive('Amount1Max must be positive'),
  ]),
});

type Payload = z.infer<typeof PayloadSchema>;

export class PancakeV3CollectHandler implements TransactionHandler {
  private service: PancakeService;

  constructor() {
    const provider = new ethers.JsonRpcProvider('https://bsc-dataseed.binance.org/');
    this.service = new PancakeService(provider);
  }

  async create(payload: Payload): Promise<CreateTransactionResponse> {
    const validation = PayloadSchema.safeParse(payload);

    if (!validation.success) {
      throw new Error(
        validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      );
    }
    payload = validation.data;
    validateEvmChain(payload.chain.toLowerCase());

    return {
      chain: payload.chain,
      data: payload,
    };
  }

  async build(data: Payload, address: string): Promise<BuildTransactionResponse> {
    validateEvmAddress(address);
    const transactions: Array<{ hex: string }> = [];
    const userAddress = address;
    if (!userAddress) {
      throw new Error('USER_ADDRESS environment variable not set');
    }

    try {
      const collectParams = {
        tokenId: parseInt(data.tokenId),
        recipient: userAddress,
        amount0Max: data.amount0Max?.toString() || '0',
        amount1Max: data.amount1Max?.toString() || '0'
      };

      const collectData = await this.service.collectFees(parseInt(data.tokenId), userAddress);
      const transaction = ethers.Transaction.from({
        to: '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364', // NFT Positions contract address
        data: collectData
      });
      transactions.push({
        hex: transaction.unsignedSerialized
      });

      return { transactions };
    } catch (error) {
      console.error(`Failed to handle action collect:`, error);
      throw error;
    }
  }
}