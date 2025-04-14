import { z } from "zod";
import { TransactionHandler, CreateTransactionResponse, BuildTransactionResponse } from "../TransactionHandler";
import { EVM_CHAIN_IDS, getEvmProvider, validateEvmAddress, validateEvmChain } from "../../utils/evm";
import { callSDK } from "./helper";
import { MintPyData } from "./types";
import { ethers, parseUnits } from "ethers";
import { ERC20Abi__factory } from "../../contracts/types";


const PayloadSchema = z.object({
  chain: z.string().nonempty("Missing required field: chain"),
  slippage: z.number().nonnegative("Slippage must be a non-negative number").min(0).max(1),
  ytAdress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid YT address"),
  tokenIn: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid token address"),
  amountIn: z.string().regex(/^\d+(\.\d+)?$/, "Amount must be a number"),
});

type Payload = z.infer<typeof PayloadSchema>;

export class mintHandler implements TransactionHandler {
  async create(payload: Payload): Promise<CreateTransactionResponse> {
    const validation = PayloadSchema.safeParse(payload);

    if (!validation.success) {
      throw new Error(validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '));
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
    const erc20Contract = ERC20Abi__factory.connect(payload.tokenIn, provider);
    const decimals = await erc20Contract.decimals();
    const amountInWei = parseUnits(payload.amountIn, decimals);


    const res = await callSDK<MintPyData>(`/v1/sdk/${chainId}/mint`, {
      chainId,
      receiver: address,
      slippage: payload.slippage,
      yt: payload.ytAdress,
      tokenIn: payload.tokenIn,
      amountIn: amountInWei.toString(),
      enableAggregator: true,
    });
    const { data, to, value } = res.tx;

    const allowance = await erc20Contract.allowance(address, to);

    if(allowance < amountInWei) {
      
      const callData = erc20Contract.interface.encodeFunctionData('approve', [
        to,
        amountInWei
      ]);

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
    const serializedTx = ethers.Transaction.from(unsignedTx).unsignedSerialized;
    transactions.push({ hex: serializedTx });

    return {transactions};
  }

}
