import { z } from "zod";
import { BuildTransactionResponse, CreateTransactionResponse, TransactionHandler } from "../TransactionHandler";
import { OrbiterClient, ENDPOINT, RouterType, ConfigOptions, TradePair, Router } from "@orbiter-finance/bridge-sdk";
import { EVM_CHAIN_IDS, getEvmProvider, checkERC20Balance, validateEvmChain } from "../../utils/evm";
import { validateAddress } from "../../utils/validators";
import { ethers } from "ethers";
import { connection } from "../../utils/solana";
import { PublicKey, TransactionMessage, VersionedTransaction, TransactionInstruction} from '@solana/web3.js';


const config: ConfigOptions = {
  apiEndpoint: ENDPOINT.MAINNET,
  defaultRouterType: RouterType.EOA,
};

const PayloadSchema = z.object({
  srcChain: z.string().nonempty("Missing required field: srcChain"),
  dstChain: z.string().nonempty("Missing required field: dstChain"), 
  dstAddress: z.string().nonempty("Missing required field: dstAddress"),
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
    if(payload.srcChain !== 'solana') validateEvmChain(payload.srcChain);
    validateAddress(payload.dstChain, payload.dstAddress);

    const orbiter = await OrbiterClient.create(config);

    getTradePair(orbiter, payload.srcChain, payload.srcTokenSymbol, payload.dstChain, payload.dstTokenSymbol);

    return {
      chain: payload.srcChain,
      data: payload,
    };
  }

  async build(data: Payload, address: string): Promise<BuildTransactionResponse> {
    const orbiter = await OrbiterClient.create(config);

    const tradePair = getTradePair(orbiter, data.srcChain, data.srcTokenSymbol, data.dstChain, data.dstTokenSymbol);

    const router = orbiter.createRouter(tradePair);
    
    const min = Number(router.getMinSendAmount());
    const max = Number(router.getMaxSendAmount());

    if (Number(data.amount) < min || Number(data.amount) > max) {
      throw new Error(`Amount: ${data.amount} must be between ${min} and ${max}`);
    }

    let res = null;
    if(data.srcChain === 'solana') {
      res = await this.generateTxSolona(data, address, router);
    } else {
      res = await this.generateTxEvm(data, address, router)
    }
    return res;
  }

  async generateTxEvm(data: Payload, address: string, router: Router) : Promise<BuildTransactionResponse>{
    const transactions: Array<{ hex: string }> = [];

    const provider = getEvmProvider(data.srcChain);
 
    const min = Number(router.getMinSendAmount());
    const max = Number(router.getMaxSendAmount());

    if (Number(data.amount) < min || Number(data.amount) > max) {
      throw new Error(`Amount: ${data.amount} must be between ${min} and ${max}`);
    }

    const { sendAmount } = router.simulationAmount(data.amount);

    const feeData = await provider.getFeeData();

    const { maxFeePerGas, maxPriorityFeePerGas } = feeData;

    if (!maxFeePerGas || !maxPriorityFeePerGas) {
      throw new Error("Missing fee data");
    }

    // make sure the token is an erc-20 token. if so, request approval before the transaction
    if(data.srcTokenSymbol.toUpperCase() === 'USDC') {
      const { isEnough } = await checkERC20Balance(provider,
        data.srcChain,
        address,
        data.amount);
      if(!isEnough) throw new Error(`transfer amount exceeds balance for ${data.srcChain} 
        ${data.srcTokenSymbol}`);
      
      const approveTransaction = await router.createApprove(address, 
        sendAmount);
      const approveRawData = approveTransaction.raw as {
        to: string;
        data: string;
        value: string;
      };

      const unsignedApproveTx: ethers.TransactionLike = {
        chainId: EVM_CHAIN_IDS[data.srcChain],
        type: 2,
        to: approveRawData.to,
        data: approveRawData.data,
        value: approveRawData.value || '0x0',
        maxFeePerGas: maxFeePerGas,
        maxPriorityFeePerGas: maxPriorityFeePerGas,
      };

      transactions.push({ hex: ethers.Transaction.from(unsignedApproveTx).unsignedSerialized });
    }
    

    const transaction = await router.createTransaction(address,
      data.dstAddress, sendAmount);
    
    const rawData = transaction.raw as {
      to: string;
      data: string;
      value: string;
    };


    const unsignedTx: ethers.TransactionLike = {
      chainId: EVM_CHAIN_IDS[data.srcChain],
      type: 2,
      ...rawData,
      maxFeePerGas: maxFeePerGas,
      maxPriorityFeePerGas: maxPriorityFeePerGas,
    };
    transactions.push({ hex: ethers.Transaction.from(unsignedTx).unsignedSerialized });

    return {transactions};
  }

  async generateTxSolona(data: Payload, address: string, router: Router) : Promise<BuildTransactionResponse>{
    const sender = new PublicKey(address);
    const { sendAmount } = router.simulationAmount(data.amount);
    const transfers = await router.createTransaction(address, data.dstAddress, sendAmount);
    console.log(transfers);
    const rawData = transfers.raw as {
      instructions: Array<TransactionInstruction>;
    };

    const blockhash = await connection.getLatestBlockhash();
    
    const messageV0 = new TransactionMessage({
        payerKey: sender,
        recentBlockhash: blockhash.blockhash,
        instructions: rawData.instructions,
    }).compileToV0Message();
    const transaction = new VersionedTransaction(messageV0);
    return {
      transactions: [{
        type: 'versioned',
        base64: Buffer.from(transaction.serialize()).toString('base64')
      }]
    }
  }
    
}



function getTradePair(orbiter: OrbiterClient, 
  srcChain: string, 
  srcTokenSymbol: string, 
  dstChain: string, 
  dstTokenSymbol: string): TradePair 
  {
  const srcChainId = srcChain === 'solana' ? 'SOLANA_MAIN' : EVM_CHAIN_IDS[srcChain].toString();
  const dstChainId = dstChain === 'solana' ? 'SOLANA_MAIN' : EVM_CHAIN_IDS[dstChain].toString();

  const tradePairs: TradePair[] = orbiter.getAvailableTradePairs(srcChainId, srcTokenSymbol);

  if (tradePairs.length === 0) {
    throw new Error(`No trade pairs found for ${srcChain} ${srcTokenSymbol}`);
  }

  const tradePair = tradePairs.find(
    (pair) => pair.dstChainId === dstChainId && pair.dstTokenSymbol === dstTokenSymbol
  );

  if (!tradePair) {
    throw new Error(
      `No trade pair found for ${srcChain} ${srcTokenSymbol} to ${dstChain} ${dstTokenSymbol}`
    );
  }

  return tradePair;
}


