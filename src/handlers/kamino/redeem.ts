import { z } from 'zod';
import { PublicKey } from '@solana/web3.js';
import { 
  KaminoMarket, 
  PROGRAM_ID, 
  KaminoAction, 
  VanillaObligation, 
  buildVersionedTransaction,
  getAssociatedTokenAddress
} from '@kamino-finance/klend-sdk';
import { TransactionHandler, CreateTransactionResponse, BuildTransactionResponse } from "../TransactionHandler";
import { connection, validateSolanaAddress } from '../../utils/solana';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import BN from 'bn.js';

const PayloadSchema = z.object({
  tokenMint: z.string().nonempty("Missing required field: tokenMint")
    .describe("The mint address of the token to redeem"),
  amount: z.number().optional()
    .describe("The amount to redeem, if not specified, redeem all"),
});

type Payload = z.infer<typeof PayloadSchema>;

export class RedeemHandler implements TransactionHandler {
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
    // Initialize Kamino market
    const market = await KaminoMarket.load(
      connection,
      new PublicKey("7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF"), // main market address
      0 // environment id
    );
    if (!market) {
      throw new Error("Failed to load Kamino market");
    }

    // Get user wallet and token mint
    const userPubkey = new PublicKey(publicKey);
    const tokenMintPubkey = new PublicKey(data.tokenMint);

    // Find token reserve (liquidity pool)
    const reserve = market.getReserveByMint(tokenMintPubkey);
    if (!reserve) {
      throw new Error(`No reserve found for token ${data.tokenMint}`);
    }

    // Get cToken mint and user's ATA
    const cTokenMint = reserve.getCTokenMint();
    const cTokenAta = await getAssociatedTokenAddress(
      cTokenMint, 
      userPubkey, 
      false, 
      TOKEN_PROGRAM_ID
    );

    // Get user's cToken balance
    let amount: BN;
    if (data.amount) {
      // If amount is specified, use the specified amount
      amount = new BN(data.amount);
    } else {
      // If amount is not specified, redeem all balance
      const balance = await connection.getTokenAccountBalance(cTokenAta);
      amount = new BN(balance.value.amount);
    }

    // Build redeem transaction
    const redeemAction = await KaminoAction.buildRedeemReserveCollateralTxns(
      market,
      amount,
      reserve.getLiquidityMint(),
      userPubkey,
      new VanillaObligation(PROGRAM_ID),
      300_000, // compute budget
      true     // refresh all
    );

    // Build versioned transaction
    const tx = await buildVersionedTransaction(connection, userPubkey, [
      ...redeemAction.computeBudgetIxs,
      ...redeemAction.setupIxs,
      ...redeemAction.lendingIxs,
      ...redeemAction.cleanupIxs,
    ]);

    // Serialize transaction
    const serializedTransaction = Buffer.from(tx.serialize());

    return {
      transactions: [{
        type: "versioned",
        base64: serializedTransaction.toString('base64'),
      }],
    };
  }
} 