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
  asset: z.string().nonempty('Missing required field: asset'),
  asset2: z.string().nonempty('Missing required field: asset'),
  action: z.enum(['add liquidity', 'remove liquidity', 'collect', 'stake', 'create pool'], {
    errorMap: () => ({
      message: 'Action must be one of: add liquidity, remove liquidity, collect, stake, create pool',
    }),
  }),
  amount: z.union([
    z.string().nonempty('Missing required field: amount'),
    z.number().positive('Amount must be positive'),
  ]),
  minrate: z.union([
    z.string().optional(),
    z.number().positive('Minrate must be positive'),
  ]),
  maxrate: z.union([
    z.string().optional(),
    z.number().positive('Maxrate must be positive'),
  ]),
});

type Payload = z.infer<typeof PayloadSchema>;

export class PancakeV3Handler implements TransactionHandler {
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
    if (isNaN(Number(payload.minrate))) {
        throw new Error('Amount must be a valid number');
    }
    if (isNaN(Number(payload.maxrate))) {
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
      switch (data.action) {
        case 'add liquidity': {
          const minRate = data.minrate ? parseFloat(data.minrate.toString()) : 0.8;
          const maxRate = data.maxrate ? parseFloat(data.maxrate.toString()) : 1.2;
          const amount0 = parseFloat(data.amount.toString());
          const amount1 = parseFloat(data.amount.toString());
          
          const addLiquidityParams: AddLiquidityParams = {
            token0: data.asset,
            token1: data.asset2,
            amount0Desired: amount0.toString(),
            amount1Desired: amount1.toString(),
            amount0Min: '0',
            amount1Min: '0',
            deadline: Math.floor(Date.now() / 1000) + 60 * 20,
            minRate,
            maxRate
          };
          const position = await this.service.addLiquidity(addLiquidityParams);
          transactions.push({
            hex: position.tokenId.toString()
          });
          break;
        }

        case 'remove liquidity': {
          const tokenId = parseInt(data.amount.toString());
          const position = await this.service.getPositionInfo(tokenId);
          
          const removeLiquidityParams: RemoveLiquidityParams = {
            tokenId,
            liquidity: position.liquidity.toString(),
            amount0Min: '0',
            amount1Min: '0',
            deadline: Math.floor(Date.now() / 1000) + 60 * 20
          };
          await this.service.removeLiquidity(removeLiquidityParams);
          transactions.push({
            hex: tokenId.toString()
          });
          break;
        }

        case 'stake': {
          const tokenId = parseInt(data.amount.toString());
          const position = await this.service.getPositionInfo(tokenId);
          
          const stakeParams: StakeParams = {
            tokenId,
            amount: position.liquidity.toString()
          };
          await this.service.stake(stakeParams);
          transactions.push({
            hex: tokenId.toString()
          });
          break;
        }

        case 'collect': {
          const tokenId = parseInt(data.amount.toString());
          const position = await this.service.getPositionInfo(tokenId);
          
          transactions.push({
            hex: tokenId.toString()
          });
          break;
        }

        case 'create pool': {
          const poolAddress = await this.service.createPool(
            data.asset,
            data.asset2,
            FEE_TIERS.MEDIUM
          );
          transactions.push({
            hex: poolAddress
          });
          break;
        }

        default:
          throw new Error(`Unsupported action: ${data.action}`);
      }

      return { transactions };
    } catch (error) {
      console.error(`Failed to handle action ${data.action}:`, error);
      throw error;
    }
  }
}
