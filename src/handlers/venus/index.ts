import { z } from "zod";
import { ethers } from "ethers";

import { TransactionHandler, CreateTransactionResponse, BuildTransactionResponse } from "../TransactionHandler";
import { validateEvmAddress, validateEvmChain, EVM_CHAIN_IDS, getEvmProvider, getTokenDecimals, parseUnits } from "../../utils/evm";
import {VenusService} from "./src/services/venus";
import { ChainId } from './src/types';
import {isVBep20TokenSymbol,isTokenSymbol,toTokenSymbol} from './src/types/tokens'

const PayloadSchema = z.object({
  chain: z.string().nonempty("Missing required field: chain"), 
  asset: z.string().nonempty("Missing required field: asset"), 
  action: z.enum(['supply', 'borrow', 'invest', 'redeem', 'withdraw', 'repayborrow'], {
    errorMap: () => ({ message: "Action must be one of: supply, invest, redeem, withdraw, borrow, repayborrow" })
  }),
  amount: z.union([
    z.string().nonempty("Missing required field: amount"),
    z.number().positive("Amount must be positive"), 
  ]),
  wallet:z.string().nonempty("Missing required field: wallet address"),
});

type Payload = z.infer<typeof PayloadSchema>;

export class VenusV5Handler implements TransactionHandler {

  async create(payload: Payload): Promise<CreateTransactionResponse> {
    const validation = PayloadSchema.safeParse(payload);

    if (!validation.success) {
      throw new Error(validation.error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join(", "));
    }
    payload = validation.data;

    payload.chain = payload.chain.toUpperCase();
    payload.asset = payload.asset?.toUpperCase();
    
    validateEvmChain(payload.chain.toLowerCase());
    
    if(payload.wallet) {
      validateEvmAddress(payload.wallet);
    }

    if (isNaN(Number(payload.amount))) {
      throw new Error("Amount must be a valid number");
    }

    return {
      chain: payload.chain,
      data: payload,
    };
  }

  async build(data: Payload, address: string): Promise<BuildTransactionResponse> {

     validateEvmAddress(address);
     const transactions: Array<{ hex: string }> = [];
     const provider = new ethers.providers.JsonRpcProvider(process.env.BNB_RPC_URL);
     const userAddress = data.wallet;
     if (!userAddress) {
       throw new Error('未设置 USER_ADDRESS 环境变量');
     }
     if (data.asset && data.asset.length > 1 && isVBep20TokenSymbol(data.asset)){
        data.asset = data.asset.slice(1);
        data.asset = data.asset.toUpperCase();
     }
     const venusService = new VenusService(null, provider, ChainId.BSC_MAINNET);

     if (data.action == 'supply' || data.action == 'invest') 
     {
         if (data.asset && isTokenSymbol(data.asset)) {
           if (data.asset == 'BNB') {
              const supplyTx = await venusService.buildSupplyBNBTransaction(data.amount.toString(), userAddress);
              const transactionUnsign = {
                  to: supplyTx.to,
                  data: supplyTx.data,
                  value: supplyTx.value, 
                  gasLimit: supplyTx.gasLimit,
                  gasPrice: supplyTx.gasPrice,
                  nonce: supplyTx.nonce
                }
              transactions.push({hex: ethers.utils.serializeTransaction(transactionUnsign)});
           }else {
              const supplyTx = await venusService.buildSupplyTransaction(toTokenSymbol(data.asset), data.amount.toString(), userAddress);
              const transactionUnsign = {
                  to: supplyTx.to,
                  data: supplyTx.data,
                  value: supplyTx.value, 
                  gasLimit: supplyTx.gasLimit,
                  gasPrice: supplyTx.gasPrice, 
                  nonce: supplyTx.nonce
                }
              transactions.push({hex: ethers.utils.serializeTransaction(transactionUnsign)});
           }
        }else{
           throw new Error('supply流程, 未发现可适配BSC代币!');
        }
     } else if (data.action == 'redeem') {
        if (data.asset && isTokenSymbol(data.asset)) {
          if (data.asset == 'BNB') {
              const supplyTx = await venusService.buildRedeemBNBTransaction(data.amount.toString(), userAddress);
              const transactionUnsign = {
                  to: supplyTx.to,
                  data: supplyTx.data,
                  value: supplyTx.value, 
                  gasLimit: supplyTx.gasLimit,
                  gasPrice: supplyTx.gasPrice,
                  nonce: supplyTx.nonce
                }
              transactions.push({hex: ethers.utils.serializeTransaction(transactionUnsign)});
          }else {
              const supplyTx = await venusService.buildRedeemTransaction(toTokenSymbol(data.asset), data.amount.toString(), userAddress);
              const transactionUnsign = {
                  to: supplyTx.to,
                  data: supplyTx.data,
                  value: supplyTx.value, 
                  gasLimit: supplyTx.gasLimit,
                  gasPrice: supplyTx.gasPrice, 
                  nonce: supplyTx.nonce
                }
              transactions.push({hex: ethers.utils.serializeTransaction(transactionUnsign)});
          }
        }else {
           throw new Error('redeem流程, 未发现可适配BSC代币!');
        }
     } else if (data.action == 'borrow') {
        if (data.asset && isTokenSymbol(data.asset)) {
          if (data.asset == 'BNB') {
              const supplyTx = await venusService.buildBorrowBNBTransaction(data.amount.toString(), userAddress);
              const transactionUnsign = {
                  to: supplyTx.to,
                  data: supplyTx.data,
                  value: supplyTx.value, 
                  gasLimit: supplyTx.gasLimit,
                  gasPrice: supplyTx.gasPrice,
                  nonce: supplyTx.nonce
                }
              transactions.push({hex: ethers.utils.serializeTransaction(transactionUnsign)});
          }else {
              const supplyTx = await venusService.buildBorrowTransaction(toTokenSymbol(data.asset), data.amount.toString(), userAddress);
              const transactionUnsign = {
                  to: supplyTx.to,
                  data: supplyTx.data,
                  value: supplyTx.value, 
                  gasLimit: supplyTx.gasLimit,
                  gasPrice: supplyTx.gasPrice, 
                  nonce: supplyTx.nonce
                }
              transactions.push({hex: ethers.utils.serializeTransaction(transactionUnsign)});
          }
        }else {
          throw new Error('redeem流程, 未发现可适配BSC代币!');
        }
     } else if (data.action == 'repayborrow') {
      if (data.asset && isTokenSymbol(data.asset)) {
        if (data.asset == 'BNB') {
            const supplyTx = await venusService.buildRepayBorrowBNBTransaction(data.amount.toString(), userAddress);
            const transactionUnsign = {
                to: supplyTx.to,
                data: supplyTx.data,
                value: supplyTx.value, 
                gasLimit: supplyTx.gasLimit,
                gasPrice: supplyTx.gasPrice,
                nonce: supplyTx.nonce
              }
            transactions.push({hex: ethers.utils.serializeTransaction(transactionUnsign)});
        }else {
            const supplyTx = await venusService.buildRepayBorrowTransaction(toTokenSymbol(data.asset), data.amount.toString(), userAddress);
            const transactionUnsign = {
                to: supplyTx.to,
                data: supplyTx.data,
                value: supplyTx.value, 
                gasLimit: supplyTx.gasLimit,
                gasPrice: supplyTx.gasPrice, 
                nonce: supplyTx.nonce
              }
            transactions.push({hex: ethers.utils.serializeTransaction(transactionUnsign)});
        }
      }else {
        throw new Error('redeem流程, 未发现可适配BSC代币!');
      }
   } 
  
    return {transactions};
  }
}
