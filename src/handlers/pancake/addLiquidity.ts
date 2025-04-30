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
    amount: z.union([
      z.string().nonempty('Missing required field: amount'),
      z.number().positive('Amount must be positive'),
    ]),
    amount2: z.union([
        z.string().optional(),
        z.number().positive('Amount2 must be positive'),
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

  export class PancakeV3AddLiquidityHandler implements TransactionHandler {

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

      // If minrate or maxrate is not provided, calculate them based on current price ratio
      if (!isNaN(Number(payload.minrate)) || !isNaN(Number(payload.maxrate))) {
        try {
          // Get current price ratio
          const currentPrice = await this.service.getPriceRatio(payload.asset, payload.asset2);
          console.log('Current price ratio:', currentPrice);

          // Calculate minrate and maxrate (±15% from current price)
          const minrate = currentPrice * 0.85; // 15% below current price
          const maxrate = currentPrice * 1.15; // 15% above current price

          // Update payload with calculated values
          payload.minrate = minrate.toString();
          payload.maxrate = maxrate.toString();

          console.log('Calculated price range:', {
            minrate: payload.minrate,
            maxrate: payload.maxrate
          });

          // Calculate price range size
          const priceRangeSize = (maxrate - minrate) / currentPrice;
          console.log('Price range size:', priceRangeSize);

          // Select fee tier based on price range size
          let fee = 500; // Default to 0.05%
          if (priceRangeSize <= 0.1) { // Very narrow range
            fee = 100; // 0.01%
          } else if (priceRangeSize <= 0.3) { // Narrow range
            fee = 500; // 0.05%
          } else { // Wide range
            fee = 2500; // 0.25%
          }
          // Calculate amount2 using getAmount1ForLiquidity
          const amount2 = await this.service.getAmount1ForLiquidity({
            token0: payload.asset,
            token1: payload.asset2,
            amount0: String(payload.amount),
            tickLower: Math.floor(Math.log(minrate) / Math.log(1.0001)),
            tickUpper: Math.ceil(Math.log(maxrate) / Math.log(1.0001)),
            fee
          });

          // Update payload with calculated amount2
          payload.amount2 = String(amount2);

        } catch (error) {
          console.error('Error calculating price range and amount2:', error);
          throw new Error('Failed to calculate price range and amount2 for liquidity position');
        }
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
            // Convert price range to ticks
            const tickLower = Math.floor(Math.log(Number(data.minrate)) / Math.log(1.0001));
            const tickUpper = Math.ceil(Math.log(Number(data.maxrate)) / Math.log(1.0001));
            
            if (!data.amount2) {
              throw new Error('amount2 is required');
            }
            
            const addLiquidityParams: AddLiquidityParams = {
              token0: data.asset,
              token1: data.asset2,
              amount0Desired: data.amount.toString(),
              amount1Desired: data.amount2.toString(),
              deadline: Math.floor(Date.now() / 1000) + 60 * 20,
              tickLower,
              tickUpper
            };
            
            const position = await this.service.addLiquidityWithSwap(addLiquidityParams, address);
            if (!position.transactionData) {
              throw new Error('Transaction data is missing');
            }
            
            // Create a complete transaction object
            const transaction = {
              to: '0x13f4EA83D0bd40E75C8222255bc855a974568Dd4', // PancakeSwap V3 Router address
              data: position.transactionData,
              value: '0x0' // No value needed for this transaction
            };
            
            transactions.push({
              hex: ethers.Transaction.from(transaction).unsignedSerialized
            });  
        return { transactions };
      } catch (error) {
        console.error(`Failed to handle action add liquidity:`, error);
        throw error;
      }
    }
  }