import { z } from 'zod';
import { ethers } from 'ethers';
import { BigNumber } from '@ethersproject/bignumber';

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

/**
 * Payload schema for removing liquidity from a PancakeSwap V3 position
 * 
 * @property chain - The blockchain network (e.g., 'bsc')
 * @property tokenId - The unique identifier of the liquidity position NFT
 *                    In PancakeSwap V3, each liquidity position is represented as an NFT,
 *                    and tokenId is used to identify which position to remove liquidity from
 * @property liquidity - The liquidity amount to remove
 * @property amount0Min - The minimum amount of token0 to receive
 * @property amount1Min - The minimum amount of token1 to receive
 * @property deadline - The deadline for the transaction
 */
const PayloadSchema = z.object({
  chain: z.string().nonempty('Missing required field: chain'),
  tokenId: z.string().nonempty('Missing required field: tokenId'),
  liquidity: z.string().optional(),
  amount0Min: z.string().optional(),
  amount1Min: z.string().optional(),
  deadline: z.number().optional(),
});

type Payload = z.infer<typeof PayloadSchema>;

export class PancakeV3RemoveLiquidityHandler implements TransactionHandler {
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
      // Get current position info to get the liquidity amount if not provided
      const position = await this.service.getPositionInfo(parseInt(data.tokenId));
      console.log('Position info in build:', position);
      
      const removeLiquidityParams: RemoveLiquidityParams = {
        tokenId: parseInt(data.tokenId),
        liquidity: data.liquidity || BigNumber.from(position.liquidity).toString(),
        amount0Min: data.amount0Min || '0',
        amount1Min: data.amount1Min || '0',
        deadline: data.deadline || Math.floor(Date.now() / 1000) + 60 * 20
      };

      console.log('Remove liquidity params:', removeLiquidityParams);

      // Get encoded transaction data for both operations
      const { decreaseLiquidityData, collectData } = await this.service.getRemoveLiquidityTransactionData(removeLiquidityParams, userAddress);

      // Create decreaseLiquidity transaction
      const decreaseLiquidityTx = {
        to: '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364', // PANCAKE_V3_NFT_POSITIONS_ADDRESS
        data: decreaseLiquidityData,
        value: '0x0',
        gasLimit: '0x100000',
        gasPrice: '0x0',
        nonce: 0
      };

      console.log('Decrease liquidity transaction:', decreaseLiquidityTx);

      const serializedDecreaseLiquidityTx = ethers.Transaction.from(decreaseLiquidityTx).unsignedSerialized;
      console.log('Serialized decrease liquidity transaction:', serializedDecreaseLiquidityTx);

      transactions.push({ 
        hex: serializedDecreaseLiquidityTx
      });

      // Create collect transaction
      const collectTx = {
        to: '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364', // PANCAKE_V3_NFT_POSITIONS_ADDRESS
        data: collectData,
        value: '0x0',
        gasLimit: '0x100000',
        gasPrice: '0x0',
        nonce: 0
      };

      console.log('Collect transaction:', collectTx);

      const serializedCollectTx = ethers.Transaction.from(collectTx).unsignedSerialized;
      console.log('Serialized collect transaction:', serializedCollectTx);

      transactions.push({ 
        hex: serializedCollectTx
      });

      return { transactions };
    } catch (error) {
      console.error(`Failed to handle action remove liquidity:`, error);
      if (error instanceof Error) {
        console.error('Error details:', {
          message: error.message,
          stack: error.stack
        });
      }
      throw error;
    }
  }
}