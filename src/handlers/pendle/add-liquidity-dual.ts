import { z } from "zod";
import { TransactionHandler, CreateTransactionResponse, BuildTransactionResponse } from "../TransactionHandler";
import { EVM_CHAIN_IDS, getEvmProvider, validateEvmChain } from "../../utils/evm";
import { callSDK } from "./helper";
import { AddLiquidityData, AddLiquidityDualData } from "./types";
import { ethers } from "ethers";
import { ERC20Abi__factory } from "../../contracts/types";
import { getMarkets } from "./api";

const PayloadSchema = z.object({
  chain: z.string().nonempty("Missing required field: chain"),
  slippage: z.number().nonnegative("Slippage must be a non-negative number").min(0).max(1),
  marketAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid market address"),
  tokenIn: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid token address"),
  amountTokenIn: z.string().regex(/^\d+(\.\d+)?$/, "Amount must be a number"),
  amountPtIn: z.string().regex(/^\d+(\.\d+)?$/, "Amount must be a number"),
});

type Payload = z.infer<typeof PayloadSchema>;

export class addLiquidityDualHandler implements TransactionHandler {
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

    const markets = await getMarkets(chainId);
    const market = markets.find((m) => m.address.toLowerCase() === payload.marketAddress.toLowerCase());
    if (!market) {
      throw new Error("Market not found");
    }
    const ptTokenAddress = market.pt.replace(`${chainId}-`, "");

    const tokenInContract = ERC20Abi__factory.connect(payload.tokenIn, provider);
    const ptTokenContract = ERC20Abi__factory.connect(ptTokenAddress, provider);

    const decimals = await tokenInContract.decimals();
    const ptDecimals = await ptTokenContract.decimals();
    const amountTokenInWei = ethers.parseUnits(payload.amountTokenIn, decimals);
    const amountPtInWei = ethers.parseUnits(payload.amountPtIn, ptDecimals);

    const res = await callSDK<AddLiquidityDualData>(
      `/v1/sdk/${chainId}/markets/${payload.marketAddress}/add-liquidity-dual`,
      {
        chainId,
        receiver: address,
        slippage: payload.slippage,
        market: payload.marketAddress,
        tokenIn: payload.tokenIn,
        amountTokenIn: amountTokenInWei.toString(),
        amountPtIn: amountPtInWei.toString(),
      }
    );
    const { data, to, value } = res.tx;

    const allowance = await tokenInContract.allowance(address, to);

    if (allowance < amountPtInWei) {
      const callData = tokenInContract.interface.encodeFunctionData("approve", [to, amountPtInWei]);

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
