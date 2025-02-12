import { z } from 'zod';
import { PublicKey } from '@solana/web3.js';
import { 
  KaminoMarket, 
  PROGRAM_ID, 
  KaminoAction, 
  VanillaObligation, 
  buildVersionedTransaction,
  sendAndConfirmVersionedTransaction 
} from '@kamino-finance/klend-sdk';
import { TransactionHandler, CreateTransactionResponse, BuildTransactionResponse } from "../TransactionHandler";
import { connection, validateSolanaAddress } from '../../utils/solana';
import BN from 'bn.js';

const PayloadSchema = z.object({
  tokenMint: z.string().nonempty("Missing required field: tokenMint"),
  amount: z.number().positive("Amount must be a positive number"),
});

type Payload = z.infer<typeof PayloadSchema>;

export class DepositHandler implements TransactionHandler {
  async create(payload: Payload): Promise<CreateTransactionResponse> {
    const validation = PayloadSchema.safeParse(payload);
    if (!validation.success) {
      throw new Error(validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '));
    }

    payload = validation.data;
    validateSolanaAddress(payload.tokenMint);

    return {
      chain: "solana",
      data: {
        tokenMint: payload.tokenMint,
        amount: payload.amount,
      },
    };
  }

  async build(data: Payload, publicKey: string): Promise<BuildTransactionResponse> {
    const market = await KaminoMarket.load(
      connection,
      new PublicKey("7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF"),
      0
    );
    if (!market) {
      throw new Error("Failed to load Kamino market");
    }

    const userPubkey = new PublicKey(publicKey);
    const tokenMintPubkey = new PublicKey(data.tokenMint);

    const reserve = market.getReserveByMint(tokenMintPubkey);
    if (!reserve) {
      throw new Error(`No reserve found for token ${data.tokenMint}`);
    }

    const depositAction = await KaminoAction.buildDepositReserveLiquidityTxns(
      market,
      new BN(data.amount),
      reserve.getLiquidityMint(),
      userPubkey,
      new VanillaObligation(PROGRAM_ID),
      300_000,
      true
    );

    const tx = await buildVersionedTransaction(connection, userPubkey, [
      ...depositAction.computeBudgetIxs,
      ...depositAction.setupIxs,
      ...depositAction.lendingIxs,
      ...depositAction.cleanupIxs,
    ]);

    const serializedTransaction = Buffer.from(tx.serialize());

    return {
      transactions: [{
        type: "versioned",
        base64: serializedTransaction.toString('base64'),
      }],
    };
  }
}
