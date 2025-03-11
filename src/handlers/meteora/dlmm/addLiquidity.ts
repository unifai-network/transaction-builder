import { z } from "zod";
import { TransactionHandler, CreateTransactionResponse, BuildTransactionResponse } from "../../TransactionHandler";
import { connection } from "../../../utils/solana";
import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import DLMM, { StrategyType } from "@meteora-ag/dlmm";
import { getMint } from "@solana/spl-token";
import { toRawAmount, prepareTransactions } from "../utils";
import Decimal from "decimal.js";

const PayloadSchema = z.object({
  lbPair: z.string().nonempty(),
  position: z.string().optional(),
  baseAmount: z.number(),
  quoteAmount: z.number(),
  strategyType: z.nativeEnum(StrategyType),
  slippage: z.number().optional(),
  minPrice: z.number().optional(),
  maxPrice: z.number().optional(),
});

type Payload = z.infer<typeof PayloadSchema>;

export class MeteoraDlmmAddLiquidityHandler implements TransactionHandler {
  async create(payload: Payload): Promise<CreateTransactionResponse> {
    const validation = PayloadSchema.safeParse(payload);

    if (!validation.success) {
      throw new Error(validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '));
    }

    payload = validation.data;

    await createSignedTransactionAndPositionPubkey(payload, PublicKey.unique());

    return {
      chain: "solana",
      data: payload,
    };
  }

  async build(data: Payload, publicKey: string): Promise<BuildTransactionResponse> {
    const { tx, positionPubKey } = await createSignedTransactionAndPositionPubkey(data, new PublicKey(publicKey));

    return {
      transactions: [{
        type: "legacy",
        base64: tx.serialize({
          requireAllSignatures: false,
        }).toString('base64'),
      }],
      positionPubKey,
    };
  }
}

async function createSignedTransactionAndPositionPubkey(data: Payload, publicKey: PublicKey) {
  const dlmm = await DLMM.create(connection, new PublicKey(data.lbPair));

  const [baseDecimals, quoteDecimals] = await Promise.all([
    getMint(connection, dlmm.lbPair.tokenXMint).then(mint => mint.decimals),
    getMint(connection, dlmm.lbPair.tokenYMint).then(mint => mint.decimals),
  ]);

  const baseAmount = toRawAmount(
    data.baseAmount,
    baseDecimals,
  );
  const quoteAmount = toRawAmount(
    data.quoteAmount,
    quoteDecimals,
  );

  const priceMultiplier = new Decimal(
    10 ** (quoteDecimals - baseDecimals)
  );

  let minBinId: number, maxBinId: number;

  if (data.minPrice && data.maxPrice) {
    const minPrice = new Decimal(data.minPrice).mul(priceMultiplier);
    minBinId = dlmm.getBinIdFromPrice(minPrice.toNumber(), false);
    const maxPrice = new Decimal(data.maxPrice).mul(priceMultiplier);
    maxBinId = dlmm.getBinIdFromPrice(maxPrice.toNumber(), true);
  } else {
    minBinId = dlmm.lbPair.activeId - 34;
    maxBinId = dlmm.lbPair.activeId + 34;
  }

  if (maxBinId - minBinId > 69) {
    throw new Error('Price range exceeds 69 bins, please reduce the range');
  }

  const singleSidedX = quoteAmount.isZero();

  let tx: Transaction, positionPubKey: PublicKey;

  if (data.position) {
    positionPubKey = new PublicKey(data.position);
    tx = await dlmm.addLiquidityByStrategy({
      positionPubKey,
      totalXAmount: baseAmount,
      totalYAmount: quoteAmount,
      strategy: {
        maxBinId,
        minBinId,
        strategyType: data.strategyType,
        singleSidedX
      },
      user: new PublicKey(publicKey),
      slippage: data.slippage,
    });

    await prepareTransactions([tx], new PublicKey(publicKey));
  } else {
    const newPositionKeypair = Keypair.generate();
    positionPubKey = newPositionKeypair.publicKey;
    tx = await dlmm.initializePositionAndAddLiquidityByStrategy({
      positionPubKey,
      totalXAmount: baseAmount,
      totalYAmount: quoteAmount,
      strategy: {
        maxBinId,
        minBinId,
        strategyType: data.strategyType,
        singleSidedX
      },
      user: new PublicKey(publicKey),
      slippage: data.slippage,
    });

    await prepareTransactions([tx], new PublicKey(publicKey));
    tx.partialSign(newPositionKeypair);
  }

  return { tx, positionPubKey };
}
