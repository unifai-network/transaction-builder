import { z } from "zod";
import { BuildTransactionResponse, CreateTransactionResponse, TransactionHandler } from "../TransactionHandler";
import { OrbiterClient, ENDPOINT, RouterType, ConfigOptions, TradePair } from "@orbiter-finance/bridge-sdk";
import { CHAIN_ID_TO_NAME, getEvmProvider, valiadateChainId, validateEvmAddress } from "../../utils/evm";
import { ethers } from "ethers";

const config: ConfigOptions = {
  apiEndpoint: ENDPOINT.MAINNET,
  defaultRouterType: RouterType.EOA,
};

const PayloadSchema = z.object({
  srcChainId: z.number().positive(),
  dstChainId: z.number().positive(),
  srcTokenSymbol: z.string().toUpperCase().nonempty("Missing required field: srcTokenSymbol"),
  dstTokenSymbol: z.string().toUpperCase().nonempty("Missing required field: dstTokenSymbol"),
  amount: z.string().regex(/^\d+(\.\d+)?$/, "Amount must be a valid number string"),
});

type Payload = z.infer<typeof PayloadSchema>;

export class OrbiterHandler implements TransactionHandler {

  async create(payload: Payload): Promise<CreateTransactionResponse> {
    const validation = PayloadSchema.safeParse(payload);

    if (!validation.success) {
      throw new Error(validation.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", "));
    }

    payload = validation.data;
    valiadateChainId(payload.srcChainId);

    return {
      chain: CHAIN_ID_TO_NAME[payload.srcChainId],
      data: payload,
    };
  }

  async build(data: Payload, address: string): Promise<BuildTransactionResponse> {
    validateEvmAddress(address);

    const provider = getEvmProvider(CHAIN_ID_TO_NAME[data.srcChainId]);

    const orbiter = await OrbiterClient.create(config);

    const tradePairs: TradePair[] = orbiter.getAvailableTradePairs(data.srcChainId.toString(), data.srcTokenSymbol);

    if (tradePairs.length === 0) {
      throw new Error(`No trade pairs found for ${data.srcChainId} ${data.srcTokenSymbol}`);
    }

    const tradePair = tradePairs.find(
      (pair) => pair.dstChainId === data.dstChainId.toString() && pair.dstTokenSymbol === data.dstTokenSymbol
    );

    if (!tradePair) {
      throw new Error(
        `No trade pair found for ${data.srcChainId} ${data.srcTokenSymbol} to ${data.dstChainId} ${data.dstTokenSymbol}`
      );
    }
    const router = orbiter.createRouter(tradePair);

    const min = Number(router.getMinSendAmount());
    const max = Number(router.getMaxSendAmount());

    if (Number(data.amount) < min || Number(data.amount) > max) {
      throw new Error(`Amount: ${data.amount} must be between ${min} and ${max}`);
    }

    const { sendAmount } = router.simulationAmount(data.amount);

    const transaction = await router.createTransaction(address, address, sendAmount);

    const rawData = transaction.raw as {
      to: string;
      data: string;
      value: string;
    };

    // promise all
    const [feeData, nonce, gasLimit] = await Promise.all([
      provider.getFeeData(),
      provider.getTransactionCount(address),
      provider.estimateGas(rawData),
    ]);

    const { maxFeePerGas, maxPriorityFeePerGas } = feeData;

    if (!maxFeePerGas || !maxPriorityFeePerGas) {
      throw new Error("Missing fee data");
    }

    const unsignedTx: ethers.TransactionLike = {
      chainId: data.srcChainId,
      type: 2,
      ...rawData,
      nonce,
      gasLimit,
      maxFeePerGas: maxFeePerGas,
      maxPriorityFeePerGas: maxPriorityFeePerGas,
    };
    const serializedTx = ethers.Transaction.from(unsignedTx).unsignedSerialized;

    return {
      transactions: [
        {
          hex: serializedTx,
        },
      ],
    };
  }
}
