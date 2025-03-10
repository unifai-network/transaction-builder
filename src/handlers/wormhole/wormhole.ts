import {
  Wormhole,
  amount,
  wormhole,
  toUniversal,
  circle,
  CircleTransfer,
  TransferState
} from '@wormhole-foundation/sdk';
import evm from '@wormhole-foundation/sdk/evm';
import solana from '@wormhole-foundation/sdk/solana';
import { z } from 'zod';
import dotenv from 'dotenv';



// import {
//   Wormhole,
//   amount,
//   wormhole,
//   toUniversal,
//   circle
// } from '@wormhole-foundation/sdk';
// import evm from '@wormhole-foundation/sdk/evm';
// import solana from '@wormhole-foundation/sdk/solana';
// import { z } from 'zod';
// import dotenv from 'dotenv';
import { TransactionHandler, CreateTransactionResponse, BuildTransactionResponse } from "../TransactionHandler";
import { validateAddress } from '../../utils/validators';
import { capitalizeFirstLetter } from '../../utils/stringUtils';
import type {
  UnsignedTransaction,
} from "@wormhole-foundation/sdk-definitions";
import type { Chain, Network } from "@wormhole-foundation/sdk-base";
import { EVM_CHAIN_IDS } from '../../utils/evm';
import { ethers  } from "ethers";

dotenv.config();

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
    }).required(),
    nativeGas: z.union([
      z.string().nonempty("NativeGas must not be empty"),
      z.number().nonnegative("NativeGas must be a non-negative number")
    ]).optional().default("0.001"),
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
        nativeGas: validatedPayload.nativeGas.toString(),
      };
      return {
        chain: normalizedPayload.from.chain,
        data: normalizedPayload,
      };
    }
  
    async build(params: any, senderAddress: string): Promise<BuildTransactionResponse> {
      // 规范化链名称
      params.from.chain = capitalizeFirstLetter(params.from.chain.toLowerCase());
      params.to.chain = capitalizeFirstLetter(params.to.chain.toLowerCase());
    
      const wh = await wormhole('Mainnet', [evm, solana], {
        // chains: {
        //   Solana: {
        //     rpc: process.env.SOL_RPC || "https://api.mainnet-beta.solana.com",
        //   },
        //   Ethereum: {
        //     rpc: process.env.ETH_RPC || "https://rpc.ankr.com/eth",
        //   }
        // }
      });
    
      // 验证链是否支持 Circle
      if (
        !circle.isCircleChain('Mainnet', params.from.chain as Chain) ||
        !circle.isCircleChain('Mainnet', params.to.chain as Chain)
      ) {
        throw new Error(`链不支持: ${params.from.chain} 或 ${params.to.chain}`);
      }
    
      // 转换金额（6位小数）
      const amt = amount.units(amount.parse(params.amount, 6));
    
      // 生成未签名交易
      const transactions: { base64?: string; hex?: string; [key: string]: any }[] = [];
      let relayerFee: bigint;
      let redeemableAmount: bigint;
    
      // 根据源链类型使用不同的方法
      if (params.from.chain.toLowerCase() === 'solana') {
        // 获取 Circle Bridge
        const fromChain = wh.getChain(params.from.chain);
        const cb = await fromChain.getCircleBridge();
        
        // 获取中继费用
        const acb = await fromChain.getAutomaticCircleBridge();
        relayerFee = await acb.getRelayerFee(params.to.chain);
    
        // 验证金额
        const minAmount = relayerFee;
        if (amt < minAmount) {
          throw new Error(`转账金额 (${amt}) 必须大于最小要求金额 (${minAmount})`);
        }
    
        redeemableAmount = amt - relayerFee;
    
        // 生成未签名交易
        for await (const tx of cb.transfer(
          senderAddress,
          { 
            chain: params.to.chain, 
            address: toUniversal(params.to.chain, params.to.address)
          },
          amt
        )) {
          transactions.push({
            base64: Buffer.from(tx.transaction).toString('base64')
          });
        }
      } else {
        // EVM 链使用 getAutomaticCircleBridge
        const fromChain = wh.getChain(params.from.chain);
        const cr = await fromChain.getAutomaticCircleBridge();
    
        // 获取中继费用
        relayerFee = await cr.getRelayerFee(params.to.chain as Chain);
    
        // 验证金额
        const minAmount = (relayerFee * 105n) / 100n; // 添加 5% 缓冲
        if (amt < minAmount) {
          throw new Error(`转账金额 (${amt}) 必须大于最小要求金额 (${minAmount})`);
        }
    
        // 计算可赎回金额
        redeemableAmount = amt - relayerFee;
    
        // 生成交易
        for await (const tx of cr.transfer(
          senderAddress,
          { 
            chain: params.to.chain, 
            address: toUniversal(params.to.chain, params.to.address)
          },
          amt,
          0n // 不使用 native gas
        )) {
          const txWithoutFrom = tx.transaction;
          if ('from' in txWithoutFrom) {
            delete txWithoutFrom.from;
          }
    
          const serializedTx = ethers.Transaction.from({
            ...txWithoutFrom,
            type: 2, // 使用 EIP-1559
          }).unsignedSerialized;
    
          transactions.push({ hex: serializedTx });
        }
      }
    
      return { 
        transactions,
        metadata: {
          fromChain: params.from.chain,
          toChain: params.to.chain,
          estimatedRelayerFee: relayerFee.toString(),
          amount: amt.toString(),
          redeemableAmount: redeemableAmount.toString()
        }
      };
    }


  
    isEvmChain(chain: string) {
      return Object.keys(EVM_CHAIN_IDS).find(key => key.toLowerCase() === chain.toLowerCase());
    }

}

  
