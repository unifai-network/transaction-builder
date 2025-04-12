import { z } from "zod";
import { TransactionHandler, CreateTransactionResponse, BuildTransactionResponse } from "../TransactionHandler";
import { EVM_CHAIN_IDS, getEvmProvider, validateEvmChain } from "../../utils/evm";
import { callSDK } from "./helper";
import { AddLiquidityData, RemoveLiquidityData } from "./types";
import { ethers } from "ethers";
import { ERC20Abi__factory } from "../../contracts/types";
import { getMarkets } from "./api";

const PayloadSchema = z.object({
  chain: z.string().nonempty("Missing required field: chain"),
  receiver: z.string().nonempty("Missing required field: receiver"),
  slippage: z.number().nonnegative("Slippage must be a non-negative number").min(0).max(1),
  marketAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid market address"),
  tokenOut: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid token address"),
  amountIn: z.string().regex(/^\d+(\.\d+)?$/, "Amount must be a number"),
});

type Payload = z.infer<typeof PayloadSchema>;

export class removeLiquidityHandler implements TransactionHandler {
  async create(payload: Payload): Promise<CreateTransactionResponse> {
    const validation = PayloadSchema.safeParse(payload);

    if (!validation.success) {
      throw new Error(validation.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", "));
    }

    validateEvmChain(payload.chain);
    payload = validation.data;

    return {
      chain: payload.chain,
      data: payload,
    };
  }

  async build(payload: Payload, address: string): Promise<BuildTransactionResponse> {
    const chainId = EVM_CHAIN_IDS[payload.chain];
    const transactions: Array<{ hex: string }> = [];
    const provider = getEvmProvider(payload.chain);

    const lpContract = ERC20Abi__factory.connect(payload.marketAddress, provider);
    const lpDecimals = await lpContract.decimals();
    const lpAmountInWei = ethers.parseUnits(payload.amountIn, lpDecimals);

    const res = await callSDK<RemoveLiquidityData>(
      `/v1/sdk/${chainId}/markets/${payload.marketAddress}/remove-liquidity`,
      {
        chainId,
        receiver: payload.receiver,
        slippage: payload.slippage,
        market: payload.marketAddress,
        enableAggregator: true,
        tokenOut: payload.tokenOut,
        amountIn: lpAmountInWei.toString(),
      }
    );
    const { data, to, value } = res.tx;

    const allowance = await lpContract.allowance(address, to);

    if (allowance < lpAmountInWei) {
      const callData = lpContract.interface.encodeFunctionData("approve", [to, lpAmountInWei]);

      const approveTransaction = {
        chainId,
        to: payload.marketAddress,
        data: callData,
      };

      transactions.push({ hex: ethers.Transaction.from(approveTransaction).unsignedSerialized });
    }

    const unsignedTx: ethers.TransactionLike = {
      chainId,
      data: data,
      to: to,
      value: value,
    };
    transactions.push({ hex: ethers.Transaction.from(unsignedTx).unsignedSerialized });

    return {
      transactions,
    };
  }
}
