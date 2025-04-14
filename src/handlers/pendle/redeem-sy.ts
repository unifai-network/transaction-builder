import { z } from "zod";
import { TransactionHandler, CreateTransactionResponse, BuildTransactionResponse } from "../TransactionHandler";
import { EVM_CHAIN_IDS, getEvmProvider, getTokenDecimals, validateEvmAddress, validateEvmChain } from "../../utils/evm";
import { callSDK } from "./helper";
import { MintPyData, RedeemPyData, RedeemSyData } from "./types";
import { ethers, parseUnits } from "ethers";
import { ERC20Abi__factory } from "../../contracts/types";
import { getMarkets } from "./api";

const PayloadSchema = z.object({
  chain: z.string().nonempty("Missing required field: chain"),
  slippage: z.number().nonnegative("Slippage must be a non-negative number").min(0).max(1),
  syAdress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid YT address"),
  tokenOut: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid token address"),
  amountIn: z.string().regex(/^\d+(\.\d+)?$/, "Amount must be a number"),
});

type Payload = z.infer<typeof PayloadSchema>;

export class redeemSYHandler implements TransactionHandler {
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

    const syAddress = payload.syAdress;
    const syContract = ERC20Abi__factory.connect(syAddress, provider);
    const syDecimals = await syContract.decimals();
    const syAmountInWei = parseUnits(payload.amountIn, syDecimals);

    const res = await callSDK<RedeemSyData>(`/v1/sdk/${chainId}/redeem-sy`, {
      chainId,
      receiver: address,
      slippage: payload.slippage,
      sy: payload.syAdress,
      tokenOut: payload.tokenOut,
      amountIn: syAmountInWei.toString(),
      enableAggregator: true,
    });

    const { data, to, value } = res.tx;

    const syAllowance = await syContract.allowance(address, to);
    if (syAllowance < syAmountInWei) {
      const callData = syContract.interface.encodeFunctionData("approve", [to, syAmountInWei]);
      const approveTransaction = {
        chainId,
        to: syAddress,
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
