import { z } from "zod";
import { TransactionHandler, CreateTransactionResponse, BuildTransactionResponse } from "../TransactionHandler";
import { EVM_CHAIN_IDS, getEvmProvider, validateEvmChain } from "../../utils/evm";
import { callSDK } from "./helper";
import { AddLiquidityData } from "./types";
import { ethers } from "ethers";
import { ERC20Abi__factory } from "../../contracts/types";

const PayloadSchema = z.object({
  chain: z.string().nonempty("Missing required field: chain"),
  receiver: z.string().nonempty("Missing required field: receiver"),
  slippage: z.number().nonnegative("Slippage must be a non-negative number").min(0).max(1),
  marketAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid market address"),
  tokenIn: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid token address"),
  amountIn: z.string().regex(/^\d+(\.\d+)?$/, "Amount must be a number"),
  zpi: z.boolean().default(false),
});

type Payload = z.infer<typeof PayloadSchema>;

export class addLiquiditytHandler implements TransactionHandler {
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


    const tokenInContract = ERC20Abi__factory.connect(payload.tokenIn, provider);
    const decimals = await tokenInContract.decimals();
    const amountInWei = ethers.parseUnits(payload.amountIn, decimals);


    const res = await callSDK<AddLiquidityData>(`/v1/sdk/${chainId}/markets/${payload.marketAddress}/add-liquidity`, {
      chainId,
      receiver: payload.receiver,
      slippage: payload.slippage,
      market: payload.marketAddress,
      enableAggregator: true,
      tokenIn: payload.tokenIn,
      amountIn: amountInWei.toString(),
      zpi: payload.zpi,
    });
    const { data, to, value } = res.tx;

    const allowance = await tokenInContract.allowance(address, to);

    if (allowance < amountInWei) {
      const callData = tokenInContract.interface.encodeFunctionData("approve", [to, amountInWei]);

      const approveTransaction = {
        chainId,
        to: payload.tokenIn,
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
