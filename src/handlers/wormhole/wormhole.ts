import {
  Wormhole,
  amount,
  wormhole,
} from '@wormhole-foundation/sdk';
import evm from '@wormhole-foundation/sdk/evm';
import solana from '@wormhole-foundation/sdk/solana';
import { getTokenDecimals } from './helpers/helpers';
import { z } from 'zod';
import dotenv from 'dotenv';
dotenv.config();
import {
  toNative,
} from "@wormhole-foundation/sdk-definitions";
import { validateAddress } from '../../utils/validators';
import { capitalizeFirstLetter } from '../../utils/stringUtils';
import { ethers } from 'ethers';
import { EVM_CHAIN_IDS, getEvmProvider } from '../../utils/evm';
import { TransactionHandler, CreateTransactionResponse, BuildTransactionResponse } from "../TransactionHandler";


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
  }).required()
});


export class WormholeHandler implements TransactionHandler {
  async create(payload: any): Promise<CreateTransactionResponse> {
    console.log('Create method - Input payload:', JSON.stringify(payload, null, 2));

    const validation = PayloadSchema.safeParse(payload);
    if (!validation.success) {
      console.error('Validation errors:', validation.error.errors);
      throw new Error(validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '));
    }

    const validatedPayload = validation.data;
    console.log('Validated payload:', JSON.stringify(validatedPayload, null, 2));

    console.log(`Validating from address - Chain: ${validatedPayload.from.chain}, Address: ${validatedPayload.from.address}`);
    validateAddress(validatedPayload.from.chain, validatedPayload.from.address);

    console.log(`Validating token address - Chain: ${validatedPayload.token.chain}, Address: ${validatedPayload.token.address}`);
    validateAddress(validatedPayload.token.chain, validatedPayload.token.address);

    console.log(`Validating to address - Chain: ${validatedPayload.to.chain}, Address: ${validatedPayload.to.address}`);
    validateAddress(validatedPayload.to.chain, validatedPayload.to.address);

    const normalizedPayload = {
      ...validatedPayload,
      amount: validatedPayload.amount.toString(),
    };

    console.log('Normalized payload:', JSON.stringify(normalizedPayload, null, 2));
    return {
      chain: normalizedPayload.from.chain,
      data: normalizedPayload,
    };
  }

  async build(params: any, senderAddress: string): Promise<BuildTransactionResponse> {
    try {
      console.log('Build method - Input params:', JSON.stringify(params, null, 2));
      console.log('Sender address:', senderAddress);

      // 规范化链名称
      params.from.chain = capitalizeFirstLetter(params.from.chain.toLowerCase());
      params.token.chain = capitalizeFirstLetter(params.token.chain.toLowerCase());
      params.to.chain = capitalizeFirstLetter(params.to.chain.toLowerCase());

      console.log('Normalized chain names:', {
        fromChain: params.from.chain,
        tokenChain: params.token.chain,
        toChain: params.to.chain
      });

      // 转换发送方地址
      const toNativeSenderAddress = toNative(params.from.chain, senderAddress);
      console.log('Native sender address:', toNativeSenderAddress);

      const wh = await wormhole('Mainnet', [evm, solana]);
      console.log('Wormhole instance created');

      // 获取源链上下文
      const sendChain = wh.getChain(params.from.chain);
      console.log('Send chain context obtained:', params.from.chain);

      // 构建token信息
      const token = Wormhole.tokenId(sendChain.chain, params.token.address);
      console.log('Token ID:', token);

      // 获取token精度
      const decimals = await getTokenDecimals(wh, token, sendChain);
      console.log('Token decimals:', decimals);

      // 处理转账金额
      const parsedAmount = amount.parse(params.amount, decimals);
      console.log('Parsed amount:', {
        display: amount.display(parsedAmount),
        decimals: parsedAmount.decimals,
        amount: parsedAmount.amount
      });

      const amt = amount.units(parsedAmount);
      console.log('Amount in base units:', amt.toString());

      // 获取自动转账桥接器
      console.log('Getting automatic token bridge...');
      const atb = await sendChain.getAutomaticTokenBridge();
      console.log('Automatic token bridge obtained');

      // 获取中继费用
      console.log('Getting relayer fee...');
      const relayerFee = await atb.getRelayerFee(params.to.chain, token.address);
      console.log('Relayer fee:', {
        baseUnits: relayerFee.toString(),
        display: amount.display(amount.fromBaseUnits(relayerFee, decimals))
      });

      // 检查最小金额要求
      const minAmount = (relayerFee * 105n) / 100n;
      console.log('Minimum amount check:', {
        provided: amt.toString(),
        minimum: minAmount.toString(),
        displayMinimum: amount.display(amount.fromBaseUnits(minAmount, decimals))
      });

      if (amt < minAmount) {
        throw new Error(
          `Amount too low. Minimum required: ${amount.display(amount.fromBaseUnits(minAmount, decimals))}`
        );
      }

      const transactions = [];

      // 使用 SDK 的 transfer 方法生成交易（包括授权和转账）
      const xferGenerator = atb.transfer(
        toNativeSenderAddress,
        Wormhole.chainAddress(params.to.chain, params.to.address),
        token.address,
        amt
      );


      // 处理所有生成的交易
      for await (const tx of xferGenerator) {
        const rawTx = tx.transaction;

        if (Object.keys(EVM_CHAIN_IDS).find(key => key.toLowerCase() === params.from.chain.toLowerCase())) {
          const provider = getEvmProvider(params.from.chain);
          const feeData = await provider.getFeeData();

          // 获取当前 nonce
          const nonce = await provider.getTransactionCount(senderAddress, 'latest');
          console.log('Current nonce:', nonce);

          // 构建交易对象
          const transaction = {
            to: rawTx.to,
            data: rawTx.data,
            value: rawTx.value?.toString() || '0x0',
            nonce: nonce,
            maxFeePerGas: feeData.maxFeePerGas?.toString(),
            maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.toString(),
            gasLimit: 300000n, // 使用较大的 gasLimit 以确保足够
            type: 2,//EIP-1559
            chainId: EVM_CHAIN_IDS[params.from.chain.toLowerCase()]
          };

          console.log('Constructed transaction:', {
            ...transaction,
            description: tx.description
          });

          transactions.push({
            hex: ethers.Transaction.from(transaction).unsignedSerialized,
            type: 'transfer' // 所有交易都是 transfer 类型
          });
        }
      }

      console.log('Final transactions array:', {
        count: transactions.length,
        types: transactions.map(tx => tx.type)
      });

      return { transactions };
    } catch (error) {
      console.error('Wormhole transfer error:', error);
      throw error;
    }
  }
}