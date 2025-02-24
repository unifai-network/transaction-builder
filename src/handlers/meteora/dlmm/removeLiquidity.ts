import { z } from "zod";
import { TransactionHandler, CreateTransactionResponse, BuildTransactionResponse } from "../../TransactionHandler";
import { connection } from "../../../utils/solana";
import { BN } from "bn.js";
import { PublicKey } from "@solana/web3.js";
import DLMM from "@meteora-ag/dlmm";
import Decimal from "decimal.js";
import { prepareTransactions } from "../utils";

const PayloadSchema = z.object({
  lbPair: z.string().nonempty(),
  position: z.string(),
  minPrice: z.number(),
  maxPrice: z.number(),
  bps: z.number(),
  shouldClaimAndClose: z.boolean(),
});

type Payload = z.infer<typeof PayloadSchema>;

export class MeteoraDlmmRemoveLiquidityHandler implements TransactionHandler {
  async create(payload: Payload): Promise<CreateTransactionResponse> {
    const validation = PayloadSchema.safeParse(payload);

    if (!validation.success) {
      throw new Error(validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '));
    }

    payload = validation.data;

    await createTransactions(payload, PublicKey.unique());

    return {
      chain: "solana",
      data: payload,
    };
  }

  async build(data: Payload, publicKey: string): Promise<BuildTransactionResponse> {
    const txs = await createTransactions(data, new PublicKey(publicKey));

    await prepareTransactions(txs, new PublicKey(publicKey));

    return {
      transactions: txs.map(tx => ({
        type: "legacy",
        base64: tx.serialize({
          requireAllSignatures: false,
        }).toString('base64'),
      })),
    };
  }
}

async function createTransactions(data: Payload, publicKey: PublicKey) {
  const dlmm = await DLMM.create(connection, new PublicKey(data.lbPair));
  const position = await dlmm.getPosition(new PublicKey(data.position));

  const priceMultiplier = new Decimal(
    10 ** (dlmm.tokenY.decimal - dlmm.tokenX.decimal)
  );

  const minPrice = new Decimal(data.minPrice).mul(priceMultiplier);
  const maxPrice = new Decimal(data.maxPrice).mul(priceMultiplier);

  let minBinId = dlmm.getBinIdFromPrice(minPrice.toNumber(), true);
  let maxBinId = dlmm.getBinIdFromPrice(maxPrice.toNumber(), false);

  minBinId = Math.max(minBinId, position.positionData.lowerBinId);
  maxBinId = Math.min(maxBinId, position.positionData.upperBinId);

  const { bins } = await dlmm.getBinsBetweenLowerAndUpperBound(minBinId, maxBinId);
  const binIds = bins.map(bin => bin.binId);

  const txs = await dlmm.removeLiquidity({
    position: new PublicKey(data.position),
    user: new PublicKey(publicKey),
    binIds: binIds,
    bps: new BN(data.bps),
    shouldClaimAndClose: data.shouldClaimAndClose,
  });

  if (Array.isArray(txs)) {
    return txs;
  } else {
    return [txs];
  }
}
