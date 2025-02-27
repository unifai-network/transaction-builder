import { z } from 'zod';
import { TransactionHandler, CreateTransactionResponse, BuildTransactionResponse } from "../TransactionHandler";
import { wormhole } from "@wormhole-foundation/sdk";
import { validateAddress } from '../../utils/validators';
import { handleTokenAmount } from "./amountHandler";
import solana from "@wormhole-foundation/sdk/solana";
import evm from "@wormhole-foundation/sdk/evm";
import sui from "@wormhole-foundation/sdk/sui";
import { Wormhole } from "@wormhole-foundation/sdk-connect";
import { connection } from "../../utils/solana";
import {
  isTokenId,
  toNative,
  TokenAddress,
} from "@wormhole-foundation/sdk-definitions";
import { EVM_CHAIN_IDS } from '../../utils/evm';
import { capitalizeFirstLetter } from '../../utils/stringUtils';
import { TokenTransfer } from "@wormhole-foundation/sdk-connect";
import { amount } from "@wormhole-foundation/sdk";
import dotenv from 'dotenv';
import { log } from 'console';
dotenv.config();

const PayloadSchema = z.object({
  token: z.object({
    chain: z.string().nonempty("Missing required field: chain"),
    address: z.string().nonempty("Missing required field: address"),
  }).required(),
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
    validateAddress(validatedPayload.token.chain, validatedPayload.token.address);
    validateAddress(validatedPayload.to.chain, validatedPayload.to.address);

    console.log(validatedPayload);
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
    try {
      params.from.chain = capitalizeFirstLetter(params.from.chain.toLowerCase());
      params.token.chain = capitalizeFirstLetter(params.token.chain.toLowerCase());
      params.to.chain = capitalizeFirstLetter(params.to.chain.toLowerCase());
      console.log('____ Wormhole params _____', params, senderAddress);
      const wh = await wormhole("Mainnet", [evm, solana, sui], {
        chains: {
          Solana: {
            rpc: process.env.SOLANA_RPC_URL,
          },
          Bsc: {
            rpc: process.env.BNB_RPC_URL,
          },
          Sui: {
            rpc: process.env.SUI_RPC_URL,
          }
        }
      });
      const fromChain = await wh.getChain(params.from.chain);
      console.log('源链实例获取成功:', fromChain);
      const automaticBridge = await fromChain.getAutomaticTokenBridge();
      console.log('自动转账桥获取成功:', automaticBridge);
      const senderAddress1 = toNative(params.from.chain, senderAddress);
      const recipient = Wormhole.chainAddress(params.to.chain, params.to.address);
      const tokenAddress = toNative(params.token.chain, params.token.address);
      const transferAmount = await handleTokenAmount(params.from.chain, params.amount, params.token.address);
      console.log('根据链和代币地址获取代币精度', transferAmount);
      const tokenAccount = await fromChain.getTokenAccount(senderAddress1, tokenAddress);
      console.log('代币账户信息:', tokenAccount);
      if (!tokenAccount) {
        console.log(`代币账户不存在，需要先${params.token.chain}创建相应的代币账户`);
        console.log("代币地址:", params.token.address);
        return { transactions: [] };
      }
      console.log(`获取${params.to.chain}目标链代币信息...`);
      const destChain = await wh.getChain(params.to.chain);
      console.log(`${params.to.chain}目标链实例获取成功:`);
      const destTokenAddress = await TokenTransfer.lookupDestinationToken(
        fromChain,
        destChain,
        {
          chain: params.to.chain, //  目标链
          address: tokenAddress,  //  源链的 Token 地址
        }
      );
     
      console.log('获取最大可兑换的 gas 数量...');
      const dtb = await destChain.getAutomaticTokenBridge();
      const relayerFee = await dtb.getRelayerFee(params.to.chain, destTokenAddress.address);
      console.log('当前 relayer 费用:', relayerFee.toString());

  
      const nativeGas = relayerFee > BigInt(1000) ? relayerFee / BigInt(10) : BigInt(1);
      console.log('计算后的 nativeGas:', nativeGas);


      console.log('获取转账报价...');
      const quote = await TokenTransfer.quoteTransfer(
        wh,
        fromChain,
        destChain,
        {
          token: {
            chain: params.from.chain,
            address: tokenAddress
          },
          amount: transferAmount,
          automatic: true,
          nativeGas: nativeGas
        }
      );
      console.log('转账报价获取成功:', quote);

      if (quote.destinationToken.amount < BigInt(0)) {
        console.log("错误: 转账金额不足以支付费用和目标链 gas");
        return { transactions: [] };
      }

  
      console.log('准备生成交易...');
      const xfer = automaticBridge.transfer(
        senderAddress1,
        recipient,
        tokenAddress,
        transferAmount,
        nativeGas
      );

      const transactions = [];
      for await (const tx of xfer) {
        const rawTx = tx.transaction.transaction;
        if (params.from.chain.toLowerCase() === 'solana') {
          console.log('===solana===',params.from.chain.toLowerCase());
          const isVersionedTransaction = rawTx.instructions && rawTx.version !== undefined;
          console.log('交易类型:', isVersionedTransaction ? 'versioned' : 'legacy');
          const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
          rawTx.recentBlockhash = blockhash;
          rawTx.lastValidBlockHeight = lastValidBlockHeight;
          console.log("rawTx", rawTx);
          transactions.push({
            type: isVersionedTransaction,
            base64: rawTx.serialize({
              requireAllSignatures: false,
            }).toString('base64'),
          });
        } else if (Object.keys(EVM_CHAIN_IDS).find(key => key.toLowerCase() === params.from.chain.toLowerCase())) {
          console.log('===evm===',params.from.chain.toLowerCase());
          transactions.push({
            hex: rawTx.serialize({
              requireAllSignatures: false,
            }).toString('base64'),
          });
        } else if (params.from.chain.toLowerCase() === 'sui') {
          console.log('===sui===',params.from.chain.toLowerCase());
          const txBytes = tx.transaction;
          transactions.push({
            base64: rawTx.serialize({
              requireAllSignatures: false,
            }).toString('base64'),
          });
        } else {
          throw new Error('Unsupported chain type');
        }
      }
      return { transactions };
    } catch (error) {
      console.error('Wormhole transfer error:', error);
      throw error;
    }
  }
}
