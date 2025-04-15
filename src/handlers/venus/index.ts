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
import { VenusService } from './src/services/venusService';
import { ChainId } from './src/types';
import { isVBep20TokenSymbol, isTokenSymbol, toTokenSymbol } from './src/types/tokens';

const PayloadSchema = z.object({
  chain: z.string().nonempty('Missing required field: chain'),
  asset: z.string().nonempty('Missing required field: asset'),
  action: z.enum(['supply', 'borrow', 'invest', 'redeem', 'withdraw', 'repayborrow'], {
    errorMap: () => ({
      message: 'Action must be one of: supply, invest, redeem, withdraw, borrow, repayborrow',
    }),
  }),
  amount: z.union([
    z.string().nonempty('Missing required field: amount'),
    z.number().positive('Amount must be positive'),
  ]),
});

type Payload = z.infer<typeof PayloadSchema>;

export class VenusV5Handler implements TransactionHandler {

  async create(payload: Payload): Promise<CreateTransactionResponse> {
    const validation = PayloadSchema.safeParse(payload);

    if (!validation.success) {
      throw new Error(
        validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      );
    }
    payload = validation.data;

    payload.chain = payload.chain.toUpperCase();
    payload.asset = payload.asset?.toUpperCase();
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
    const provider = new ethers.JsonRpcProvider('https://bsc-dataseed.binance.org/');
    const userAddress = address;
    if (!userAddress) {
      throw new Error('USER_ADDRESS environment variable not set');
    }
    
    if (data.asset && data.asset.length > 1 && isVBep20TokenSymbol(data.asset)) {
      data.asset = data.asset.slice(1);
      data.asset = data.asset.toUpperCase();
    }
    const venusService = new VenusService(null, provider, ChainId.BSC_MAINNET);

    if (data.action == 'supply' || data.action == 'invest') {
      if (data.asset && isTokenSymbol(data.asset)) {
        if (data.asset == 'BNB') {
          const supplyTx = await venusService.buildSupplyBNBTransaction(
            data.amount.toString(),
            userAddress
          );
          transactions.push({ 
            hex: ethers.Transaction.from({
              to: supplyTx.to.toString(),
              data: supplyTx.data,
              value: supplyTx.value,
              gasLimit: Number(supplyTx.gasLimit),
              gasPrice: Number(supplyTx.gasPrice),
              nonce: Number(supplyTx.nonce),
            }).unsignedSerialized 
          });
        } else {
          const supplyTx = await venusService.buildSupplyTransaction(
            toTokenSymbol(data.asset),
            data.amount.toString(),
            userAddress
          );
          transactions.push({ 
            hex: ethers.Transaction.from({
              to: supplyTx.to.toString(),
              data: supplyTx.data,
              value: supplyTx.value,
              gasLimit: Number(supplyTx.gasLimit),
              gasPrice: Number(supplyTx.gasPrice),
              nonce: Number(supplyTx.nonce),
            }).unsignedSerialized 
          });
        }
      } else {
        throw new Error('No compatible BSC token found for supply process!');
      }
    } else if (data.action == 'redeem') {
      if (data.asset && isTokenSymbol(data.asset)) {
        if (data.asset == 'BNB') {
          const supplyTx = await venusService.buildRedeemBNBTransaction(
            data.amount.toString(),
            userAddress
          );
          transactions.push({ 
            hex: ethers.Transaction.from({
              to: supplyTx.to.toString(),
              data: supplyTx.data,
              value: supplyTx.value,
              gasLimit: Number(supplyTx.gasLimit),
              gasPrice: Number(supplyTx.gasPrice),
              nonce: Number(supplyTx.nonce),
            }).unsignedSerialized 
          });
        } else {
          const supplyTx = await venusService.buildRedeemTransaction(
            toTokenSymbol(data.asset),
            data.amount.toString(),
            userAddress
          );
          transactions.push({ 
            hex: ethers.Transaction.from({
              to: supplyTx.to.toString(),
              data: supplyTx.data,
              value: supplyTx.value,
              gasLimit: Number(supplyTx.gasLimit),
              gasPrice: Number(supplyTx.gasPrice),
              nonce: Number(supplyTx.nonce),
            }).unsignedSerialized 
          });
        }
      } else {
        throw new Error('No compatible BSC token found for redeem process!');
      }
    } else if (data.action == 'borrow') {
      if (data.asset && isTokenSymbol(data.asset)) {
        if (data.asset == 'BNB') {
          const supplyTx = await venusService.buildBorrowBNBTransaction(
            data.amount.toString(),
            userAddress
          );
          transactions.push({ 
            hex: ethers.Transaction.from({
              to: supplyTx.to.toString(),
              data: supplyTx.data,
              value: supplyTx.value,
              gasLimit: Number(supplyTx.gasLimit),
              gasPrice: Number(supplyTx.gasPrice),
              nonce: Number(supplyTx.nonce),
            }).unsignedSerialized 
          });
        } else {
          const supplyTx = await venusService.buildBorrowTransaction(
            toTokenSymbol(data.asset),
            data.amount.toString(),
            userAddress
          );
          transactions.push({ 
            hex: ethers.Transaction.from({
              to: supplyTx.to.toString(),
              data: supplyTx.data,
              value: supplyTx.value,
              gasLimit: Number(supplyTx.gasLimit),
              gasPrice: Number(supplyTx.gasPrice),
              nonce: Number(supplyTx.nonce),
            }).unsignedSerialized 
          });
        }
      } else {
        throw new Error('No compatible BSC token found for borrow process!');
      }
    } else if (data.action == 'repayborrow') {
      if (data.asset && isTokenSymbol(data.asset)) {
        if (data.asset == 'BNB') {
          const supplyTx = await venusService.buildRepayBorrowBNBTransaction(
            data.amount.toString(),
            userAddress
          );
          transactions.push({ 
            hex: ethers.Transaction.from({
              to: supplyTx.to.toString(),
              data: supplyTx.data,
              value: supplyTx.value,
              gasLimit: Number(supplyTx.gasLimit),
              gasPrice: Number(supplyTx.gasPrice),
              nonce: Number(supplyTx.nonce),
            }).unsignedSerialized 
          });
        } else {
          const supplyTx = await venusService.buildRepayBorrowTransaction(
            toTokenSymbol(data.asset),
            data.amount.toString(),
            userAddress
          );
          transactions.push({ 
            hex: ethers.Transaction.from({
              to: supplyTx.to.toString(),
              data: supplyTx.data,
              value: supplyTx.value,
              gasLimit: Number(supplyTx.gasLimit),
              gasPrice: Number(supplyTx.gasPrice),
              nonce: Number(supplyTx.nonce),
            }).unsignedSerialized 
          });
        }
      } else {
        throw new Error('No compatible BSC token found for repay borrow process!');
      }
    }

    return { transactions };
  }
}
