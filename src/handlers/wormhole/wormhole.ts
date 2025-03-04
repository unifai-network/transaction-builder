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
  // token: z.object({
  //   chain: z.string().nonempty("Missing required field: chain"),
  //   address: z.string().nonempty("Missing required field: address"),
  // }).required(),
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
    // validateAddress(validatedPayload.token.chain, validatedPayload.token.address);
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
      // params.token.chain = capitalizeFirstLetter(params.token.chain.toLowerCase());
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

      const automatic =  true

      const amt = amount.units(amount.parse(params.amount, 6));
      // console.log('wh.tokenTransfer',
      //   amt,
      //   source.address,
      //   destination.address,
      //   automatic)
 

      const xfer = await wh.circleTransfer(
        amt,
        source.address,
        destination.address,
        automatic,
      );

      const ethAddr = toNative(params.from.chain, params.from.address);
      const emitterAddr = ethAddr.toUniversalAddress().toString()
      console.log('xfer', xfer);
      const nativeGas = amount.units(amount.parse(0.00001, 6));

        const cr = await sendChain.getAutomaticCircleBridge();
        const xferlist = cr.transfer(source.address, { chain: destination.chain, address: emitterAddr }, amt, nativeGas);
    
console.log('xferlist', xferlist);


      const transactions = [];
      for await (const tx of xferlist) {
        console.log('tx', tx);
        // console.log('tx', JSON.stringify(tx, null, 2));
  
        if (params.from.chain.toLowerCase() === 'solana') {
          const rawTx = tx.transaction.transaction;
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

        } else if (this.isEvmChain(params.from.chain)) {
          console.log('===evm===', tx);
          
          // 获取原始交易数据
          const rawTx = tx.transaction;
          console.log('rawTx', JSON.stringify(rawTx, null, 2));
          
          const provider = getEvmProvider(params.from.chain);
          const feeData = await provider.getFeeData();
          const nonce = await provider.getTransactionCount(rawTx.from);
          
          // 估算 gas limit
          const gasLimit = await provider.estimateGas({
            from: rawTx.from,
            to: rawTx.to,
            data: rawTx.data,
          });

          // 构建完整的交易对象
          const transaction = {
            to: rawTx.to,
            data: rawTx.data,
            from: rawTx.from,
            chainId: Number(rawTx.chainId),
            nonce: nonce,
            value: 0,  // 对于 approve 交易，value 为 0
            gasLimit: gasLimit,
            maxFeePerGas: feeData.maxFeePerGas,
            maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
            type: 2, // EIP-1559
          };

          console.log('构建的交易:', transaction);
        
          // 创建未签名交易
          const unsignedTx = ethers.Transaction.from({
            ...transaction,
            // 确保 BigNumber 转换
            maxFeePerGas: transaction.maxFeePerGas?.toString(),
            maxPriorityFeePerGas: transaction.maxPriorityFeePerGas?.toString(),
            gasLimit: transaction.gasLimit.toString(),
          });
        
          transactions.push({
            type: 'evm',
            hex: unsignedTx.unsignedSerialized,
          });
        } else if (params.from.chain.toLowerCase() === 'sui') {
          const rawTx = tx.transaction;
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

  isEvmChain(chain: string) {
    return Object.keys(EVM_CHAIN_IDS).find(key => key.toLowerCase() === chain.toLowerCase());
  }
}
