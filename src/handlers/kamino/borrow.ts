import { z } from 'zod';
import { PublicKey } from '@solana/web3.js';
import { KaminoMarket, PROGRAM_ID, KaminoAction, VanillaObligation } from '@kamino-finance/klend-sdk';
import { TransactionHandler, CreateTransactionResponse, BuildTransactionResponse } from "../TransactionHandler";
import { connection, validateSolanaAddress } from '../../utils/solana';

const PayloadSchema = z.object({
  tokenMint: z.string().nonempty("Missing required field: tokenMint"),
  amount: z.number().positive("Amount must be a positive number"),
});

type Payload = z.infer<typeof PayloadSchema>;

export class BorrowHandler implements TransactionHandler {
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
      new PublicKey(PROGRAM_ID),
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


    const obligation = await market.getUserVanillaObligation(userPubkey);
    if (!obligation) {
      throw new Error("No obligation found. Please deposit collateral first.");
    }

    // Build borrow transaction using KaminoAction
    // @ts-ignore - Ignore type error, SDK type definitions might be incomplete
    const kaminoAction = await KaminoAction.buildBorrowTxns(
      market,
      data.amount,
      reserve.symbol,
      obligation,
      userPubkey
    );

    // @ts-ignore - Ignore type error, use transaction returned by SDK
    const transactions = await kaminoAction.getTransactions();
    const transaction = transactions.lendingTxn;
    if (!transaction) {
      throw new Error("Failed to build borrow transaction");
    }

    const serializedTransaction = transaction.serialize({
      requireAllSignatures: false,
    });

    return {
      transactions: [{
        type: "versioned",
        base64: serializedTransaction.toString('base64'),
      }],
    };
  }
} 