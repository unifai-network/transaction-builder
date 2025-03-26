import { z } from 'zod';
import { ethers } from 'ethers';
import { TransactionHandler, CreateTransactionResponse, BuildTransactionResponse } from "../TransactionHandler";
import { getTokenDecimals, validateEvmAddress, validateEvmChain, EVM_CHAIN_IDS, parseUnits } from '../../utils/evm';

const PayloadSchema = z.object({
  chain: z.string().nonempty("Missing required field: chain"),
  inputToken: z.string().nonempty("Missing required field: inputToken"),
  outputToken: z.string().nonempty("Missing required field: outputToken"),
  amount: z.union([
    z.string().nonempty("Missing required field: amount"),
    z.number().positive("Amount must be positive")
  ]),
  slippage: z.number().min(0).max(100).default(1),
});

type Payload = z.infer<typeof PayloadSchema>;

export class SwapHandler implements TransactionHandler {
  private readonly API_BASE_URL = "https://api.1inch.dev/swap/v6.0";
  private readonly API_KEY = process.env.ONEINCH_API_KEY;

  async create(payload: Payload): Promise<CreateTransactionResponse> {
    const validation = PayloadSchema.safeParse(payload);

    if (!validation.success) {
      throw new Error(validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '));
    }

    payload = validation.data;

    payload.chain = payload.chain.toLowerCase();
    payload.inputToken = payload.inputToken.toLowerCase();
    payload.outputToken = payload.outputToken.toLowerCase();

    validateEvmChain(payload.chain);
    validateEvmAddress(payload.inputToken);
    validateEvmAddress(payload.outputToken);

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

    const decimals = await getTokenDecimals(data.chain, data.inputToken);
    const amountInWei = parseUnits(data.amount, decimals);
    const chainId = EVM_CHAIN_IDS[data.chain];
    const transactions: Array<{ hex: string }> = [];

    const allowance = await this.checkAllowance(chainId, data.inputToken, address);
 
    if (allowance < amountInWei) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const approveTx = await this.buildApproveTx(chainId, data.inputToken);
      transactions.push({ hex: ethers.Transaction.from(approveTx).unsignedSerialized });
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
    const swapTx = await this.buildSwapTx(data, address, chainId, decimals);
    delete swapTx.from;
    transactions.push({ hex: ethers.Transaction.from(swapTx).unsignedSerialized });

    return { transactions };
  }

  private async apiCall(endpoint: string, params: Record<string, any> = {}): Promise<any> {
    const queryString = new URLSearchParams(params).toString();
    const url = `${this.API_BASE_URL}${endpoint}${queryString ? '?' + queryString : ''}`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.API_KEY}`,
        'accept': 'application/json',
      }
    });
    if (!response.ok) {
      throw new Error(`API call failed: ${response.status} ${response.statusText} ${await response.text()}`);
    }
    return await response.json();
  }

  private async checkAllowance(chainId: number, tokenAddress: string, walletAddress: string): Promise<bigint> {
    const data = await this.apiCall(`/${chainId}/approve/allowance`, {
      tokenAddress,
      walletAddress
    });
    return BigInt(data.allowance);
  }

  private async buildApproveTx(chainId: number, tokenAddress: string): Promise<any> {
    return await this.apiCall(`/${chainId}/approve/transaction`, {
      tokenAddress
    });
  }

  private async buildSwapTx(data: Payload, address: string, chainId: number, decimals: number): Promise<any> {
    const swapPayload: Record<string, any> = {
      src: data.inputToken,
      dst: data.outputToken,
      amount: parseUnits(data.amount, decimals).toString(),
      from: address,
      slippage: data.slippage,
      disableEstimate: 'true',
      allowPartialFill: 'false',
    }
    if (process.env.ONEINCH_REFERRER && process.env.ONEINCH_FEE) {
      swapPayload.referrer = process.env.ONEINCH_REFERRER;
      swapPayload.fee = process.env.ONEINCH_FEE;
    }
    const swapData = await this.apiCall(`/${chainId}/swap`, swapPayload);
    return swapData.tx;
  }
}
