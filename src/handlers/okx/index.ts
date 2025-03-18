import { AuthorizationType, Chain, OkxDefiAPI } from "./api";
import { BuildTransactionResponse, CreateTransactionResponse, TransactionHandler } from "../TransactionHandler";
import { z } from "zod";
import bs58 from 'bs58';
import { ethers } from "ethers";
import { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import { connection } from "../../utils/solana";

export const api = new OkxDefiAPI(process.env.OKX_API_KEY!, process.env.OKX_SECRET_KEY!, process.env.OKX_PASSPHRASE!);

const userInputSchema = z.object({
  chainId: z.string().optional(),
  coinAmount: z.string(),
  tokenAddress: z.string().optional(),
});

const expectOutputSchema = z.object({
  chainId: z.string().optional(),
  coinAmount: z.string(),
  tokenAddress: z.string().optional(),
});

const PayloadSchema = z.object({
  address: z.string(),
  investmentId: z.string(),
  userInputList: z.array(userInputSchema),
  expectOutputList: z.array(expectOutputSchema),
  extra: z.string().optional(),
});

type Payload = z.infer<typeof PayloadSchema>;

export class OkxDefiSubscribeHandler implements TransactionHandler {
  async create(payload: Payload): Promise<CreateTransactionResponse> {
    const validation = PayloadSchema.safeParse(payload);

    if (!validation.success) {
      throw new Error(validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '));
    }

    payload = validation.data;

    await api.generateSubscriptionTransaction(payload);

    const { chainId } = await api.getProductDetail({
      investmentId: payload.investmentId
    });

    const chain = Chain[Number(chainId)].toLowerCase();

    return {
      chain,
      data: payload,
    };
  }

  async build(data: Payload, publicKey: string): Promise<BuildTransactionResponse> {
    const { chainId } = await api.getProductDetail({
      investmentId: data.investmentId
    });
    const chain = Number(chainId) as Chain;

    const dataList: any[] = [];

    if (chain !== Chain.Solana) {
      for (const userInput of data.userInputList) {
        await api.generateAuthorizationTransaction({
          type: AuthorizationType.Subscription,
          address: data.address,
          investmentId: data.investmentId,
          userInputList: [userInput],
        }).then(res => {
          dataList.push(...res.dataList);
        });

        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    await api.generateSubscriptionTransaction(data).then(res => {
      dataList.push(...res.dataList);
    });

    return {
      transactions: await getTransactions(dataList, chain, publicKey)
    };
  }
}

export class OkxDefiRedeemHandler implements TransactionHandler {
  async create(payload: Payload): Promise<CreateTransactionResponse> {
    const validation = PayloadSchema.safeParse(payload);

    if (!validation.success) {
      throw new Error(validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '));
    }

    payload = validation.data;

    await api.generateRedemptionTransaction(payload);

    const { chainId } = await api.getProductDetail({
      investmentId: payload.investmentId
    });

    const chain = Chain[Number(chainId)].toLowerCase();

    return {
      chain,
      data: payload,
    };
  }

  async build(data: Payload, publicKey: string): Promise<BuildTransactionResponse> {
    const { chainId } = await api.getProductDetail({
      investmentId: data.investmentId
    });
    const chain = Number(chainId) as Chain;

    const dataList: any[] = [];

    if (chain !== Chain.Solana) {
      for (const userInput of data.userInputList) {
        await api.generateAuthorizationTransaction({
          type: AuthorizationType.Redemption,
          address: data.address,
          investmentId: data.investmentId,
          userInputList: [userInput],
        }).then(res => {
          dataList.push(...res.dataList);
        });

        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    await api.generateRedemptionTransaction(data).then(res => {
      dataList.push(...res.dataList);
    });

    return {
      transactions: await getTransactions(dataList, chain, publicKey)
    };
  }
}

export class OkxDefiClaimBonusHandler implements TransactionHandler {
  async create(payload: Payload): Promise<CreateTransactionResponse> {
    const validation = PayloadSchema.safeParse(payload);

    if (!validation.success) {
      throw new Error(validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '));
    }

    payload = validation.data;

    await api.generateClamingBonusTransaction(payload);

    const { chainId } = await api.getProductDetail({
      investmentId: payload.investmentId
    });

    const chain = Chain[Number(chainId)].toLowerCase();

    return {
      chain,
      data: payload,
    };
  }

  async build(data: Payload, publicKey: string): Promise<BuildTransactionResponse> {
    const { chainId } = await api.getProductDetail({
      investmentId: data.investmentId
    });
    const chain = Number(chainId) as Chain;

    const dataList: any[] = [];

    if (chain !== Chain.Solana) {
      for (const userInput of data.userInputList) {
        await api.generateAuthorizationTransaction({
          type: AuthorizationType.Claim,
          address: data.address,
          investmentId: data.investmentId,
          userInputList: data.userInputList,
        }).then(res => {
          dataList.push(...res.dataList);
        });

        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    await api.generateClamingBonusTransaction(data).then(res => {
      dataList.push(...res.dataList);
    });

    return {
      transactions: await getTransactions(dataList, chain, publicKey)
    };
  }
}

async function getTransactions(dataList: {
  from: string;
  to: string;
  value: string;
  serializedData: string;
  originalData: string;
  callDataType: string;
  signatureData: string;
}[], chain: Chain, publicKey: string) {
  if (chain == Chain.Solana) {
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

    return dataList.map(data => {
      const serializedData = bs58.decode(data.serializedData);

      try {
        const tx = Transaction.from(serializedData);
        if (tx.signatures.filter(sig => sig.publicKey.toString() !== publicKey).length === 0) {
          tx.recentBlockhash = blockhash;
          tx.lastValidBlockHeight = lastValidBlockHeight;
          tx.feePayer = new PublicKey(publicKey);
        }
        tx.signatures.forEach(sig => {
          if (sig.publicKey.toString() === publicKey) {
            sig.signature = null;
          }
        });
        return {
          type: 'legacy',
          base64: tx.serialize({
            requireAllSignatures: false,
            verifySignatures: false,
          }).toString('base64')
        }
      } catch {
        const tx = VersionedTransaction.deserialize(serializedData);
        tx.message.recentBlockhash = blockhash;
        return {
          type: 'versioned',
          base64: Buffer.from(tx.serialize()).toString('base64')
        }
      }
    });
  } else {
    return dataList.map(data => ({
      hex: ethers.Transaction.from({
        to: data.to,
        value: data.value,
        data: data.serializedData
      }).unsignedSerialized
    }))
  }
}
