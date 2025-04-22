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
  poolAddress: z.string().nonempty('Missing required field: poolAddress'),
  amount: z.union([
    z.string().nonempty('Missing required field: amount'),
    z.number().positive('Amount must be positive'),
  ]),
});

type Payload = z.infer<typeof PayloadSchema>;

export class PancakeV3StakeHandler implements TransactionHandler {
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

    if (isNaN(Number(payload.amount))) {
      throw new Error('Amount must be a valid number');
    }

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
      const stakeParams: StakeParams = {
        tokenId: parseInt(data.tokenId)
      };

      await this.service.stake(stakeParams);
      transactions.push({
        hex: '0x' // Since stake returns void, we'll use a placeholder
      });

      return { transactions };
    } catch (error) {
      console.error(`Failed to handle action stake:`, error);
      throw error;
    }
  }
}