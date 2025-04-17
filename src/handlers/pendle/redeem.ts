import { z } from "zod";
import { TransactionHandler, CreateTransactionResponse, BuildTransactionResponse } from "../TransactionHandler";
import { EVM_CHAIN_IDS, getEvmProvider, getTokenDecimals, validateEvmAddress, validateEvmChain } from "../../utils/evm";
import { callSDK } from "./helper";
import { MintPyData, RedeemPyData } from "./types";
import { ethers, parseUnits } from "ethers";
import { ERC20Abi__factory } from "../../contracts/types";
import { getMarkets } from "./api";

const PayloadSchema = z.object({
  chain: z.string().nonempty("Missing required field: chain"),
  slippage: z.number().nonnegative("Slippage must be a non-negative number").min(0).max(1),
  yt: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid YT address"),
  tokenOut: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid token address"),
  amountIn: z.string().regex(/^\d+(\.\d+)?$/, "Amount must be a number"),
});

type Payload = z.infer<typeof PayloadSchema>;

export class redeemHandler implements TransactionHandler {
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
    validateEvmAddress(address);

    const transactions: Array<{ hex: string }> = [];
    const chainId = EVM_CHAIN_IDS[payload.chain];
    const provider = getEvmProvider(payload.chain);

    // query PT and YT token addresses, then need to check allowance, if not enough, then approve
    const markets = await getMarkets(chainId);
    const market = markets.find((m) => m.yt.toLowerCase() === `${chainId}-` + payload.yt.toLowerCase());
    if (!market) {
      throw new Error("Market not found");
    }

    const ptAddress = market.pt.replace(`${chainId}-`, "");
    const ytAddress = market.yt.replace(`${chainId}-`, "");

    const ptContract = ERC20Abi__factory.connect(ptAddress, provider);
    const ytContract = ERC20Abi__factory.connect(ytAddress, provider);

    const ptDecimals = await ptContract.decimals();
    const ytDecimals = await ytContract.decimals();
    const ytAmountInWei = parseUnits(payload.amountIn, ytDecimals);
    const ptAmountInWei = parseUnits(payload.amountIn, ptDecimals);

    const res = await callSDK<RedeemPyData>(`/v1/sdk/${chainId}/redeem`, {
      chainId,
      receiver: address,
      slippage: payload.slippage,
      yt: payload.yt,
      tokenOut: payload.tokenOut,
      amountIn: ytAmountInWei.toString(),
      enableAggregator: true,
    });

    const { data, to, value } = res.tx;

    const ptAllowance = await ptContract.allowance(address, to);
    const ytAllowance = await ytContract.allowance(address, to);
    if (ptAllowance < ptAmountInWei) {
      const callData = ptContract.interface.encodeFunctionData("approve", [to, ptAmountInWei]);
      const approveTransaction = {
        chainId,
        to: ptAddress,
        data: callData,
      };
      transactions.push({ hex: ethers.Transaction.from(approveTransaction).unsignedSerialized });
    }
    if (ytAllowance < ytAmountInWei) {
      const callData = ytContract.interface.encodeFunctionData("approve", [to, ytAmountInWei]);
      const approveTransaction = {
        chainId,
        to: ytAddress,
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
    const serializedTx = ethers.Transaction.from(unsignedTx).unsignedSerialized;
    transactions.push({ hex: serializedTx });

    return { transactions };
  }
}
