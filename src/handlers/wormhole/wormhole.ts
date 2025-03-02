import {
  Chain,
  Network,
  Wormhole,
  amount,
  wormhole,
  TokenId,
  TokenTransfer,
} from '@wormhole-foundation/sdk';
import { Keypair, PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import evm from '@wormhole-foundation/sdk/evm';
import solana from '@wormhole-foundation/sdk/solana';
import sui from '@wormhole-foundation/sdk/sui';
import aptos from '@wormhole-foundation/sdk/aptos';
import { getTokenDecimals } from './helpers/helpers';
import { z } from 'zod';
import dotenv from 'dotenv';
dotenv.config();
import { TransactionHandler, CreateTransactionResponse, BuildTransactionResponse } from "../TransactionHandler";
import { validateAddress } from '../../utils/validators';
import { handleTokenAmount } from "./amountHandler";
import { connection } from "../../utils/solana";
import {
  isTokenId,
  toNative,
  TokenAddress,
} from "@wormhole-foundation/sdk-definitions";
import { capitalizeFirstLetter } from '../../utils/stringUtils';
import { log } from 'console';

// evm
import { ethers } from 'ethers';
import { EVM_CHAIN_IDS,getEvmProvider } from '../../utils/evm';


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

      const toNativeSenderAddress = toNative(params.from.chain, senderAddress);
      const wh = await wormhole('Mainnet', [evm, solana, sui, aptos], {
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
      console.log('senderAddress', senderAddress);
      // 获取链上下文
      const sendChain = wh.getChain(params.from.chain);
      // const rcvChain = wh.getChain('Monad');
      // 从本地密钥获取签名者，但任何实现签名者接口的东西（例如，围绕网络钱包的包装）都应该有效

      const source = {
        chain: params.from.chain,
        address: Wormhole.chainAddress(params.from.chain, params.from.address),
      }
      const destination = {
        chain: params.to.chain,
        address: Wormhole.chainAddress(params.to.chain, params.to.address),
      }

      // 允许转移本地gas代币的快捷方式
      // const token = Wormhole.tokenId(sendChain.chain, 'native');  
      const token = Wormhole.tokenId(sendChain.chain, params.token.address);

      // 将自动转移设置为false以进行手动转移
      const automatic = false;

      // 自动中继器能够将一些本地gas资金交付到目标账户
      // 指定的本地gas金额将根据合同提供的交换率
      // 以本地gas代币计价进行交换
      const nativeGas = automatic ? '0.1' : undefined;

      // 用于规范化金额以考虑代币的小数
      const decimals = await getTokenDecimals(wh, token, sendChain);

      // 定义要转移的代币数量
      const amt = amount.units(amount.parse(params.amount, decimals));

      console.log('wh.tokenTransfer',
        token,
        amt,
        source.address,
        destination.address,
        automatic,
        params.payload,
        nativeGas ? amount.units(amount.parse(nativeGas, decimals)) : undefined,);

      // 创建一个TokenTransfer对象 跟踪转移的状态
      const xfer = await wh.tokenTransfer(
        token,
        amt,
        source.address,
        destination.address,
        automatic,
        params.payload,
        nativeGas ? amount.units(amount.parse(nativeGas, decimals)) : undefined,
      );
      console.log('xfer', xfer);

      // const quote = await TokenTransfer.quoteTransfer(
      //   wh,
      //   source.chain,
      //   destination.chain,
      //   xfer.transfer
      // );

      // if (xfer.transfer.automatic && quote.destinationToken.amount < 0)
      //   throw 'The amount requested is too low to cover the fee and any native gas requested.';

      // 1）提交交易到源链，传递签名者以签署任何交易
      // const senderAddress = toNative(source.chain, source.address); //源码逻辑
      // token: TokenId;
      // amount: bigint;
      // from: ChainAddress;
      // to: ChainAddress;
      // automatic?: boolean;
      // payload?: Uint8Array;
      // nativeGas?: bigint;
      const tb = await sendChain.getTokenBridge();
      console.log('tb.transfer____', toNativeSenderAddress, destination.address, token, amt);
      const xferlist = tb.transfer(toNativeSenderAddress, destination.address, token.address, amt);
      const transactions = [];
      for await (const tx of xferlist) {
        console.log('tx', JSON.stringify(tx, null, 2));
        const rawTx = tx.transaction.transaction;
        if (params.from.chain.toLowerCase() === 'solana') {
          const isVersionedTransaction = rawTx.instructions && rawTx.version !== undefined;
          const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
          rawTx.recentBlockhash = blockhash;
          rawTx.lastValidBlockHeight = lastValidBlockHeight;
          rawTx.feePayer = new PublicKey(senderAddress)
          if (tx.transaction.signers && tx.transaction.signers.length > 0) {
            rawTx.partialSign(...tx.transaction.signers);
          }
          console.log("rawTx", rawTx);
          console.log('交易类型:', isVersionedTransaction ? 'versioned' : 'legacy');
          transactions.push({
            type: isVersionedTransaction ? 'versioned' : 'legacy',
            base64: rawTx.serialize({
              requireAllSignatures: false,
              // verifySignatures: false,      
              // skipPreflight: true,       
              // preflightCommitment: 'confirmed' 
            }).toString('base64'),
          });

        } else if (Object.keys(EVM_CHAIN_IDS).find(key => key.toLowerCase() === params.from.chain.toLowerCase())) {
          console.log('===evm===', params.from.chain.toLowerCase());
          
          const rawTx = tx.transaction.transaction;
          const provider = getEvmProvider(params.from.chain);
          const feeData = await provider.getFeeData();
          
          // 只需要添加 chainId 和 gas 参数
          const transaction = {
            ...rawTx,  // 使用原始交易的所有信息
            chainId: EVM_CHAIN_IDS[params.from.chain.toLowerCase()],
            maxFeePerGas: feeData.maxFeePerGas?.toString(),
            maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.toString(),
          };
        
          const serializedTx = ethers.Transaction.from(transaction).unsignedSerialized;
        
          transactions.push({
            hex: serializedTx,
          });
        } else if (params.from.chain.toLowerCase() === 'sui') {
          console.log('===sui===', params.from.chain.toLowerCase());
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
