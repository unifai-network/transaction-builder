import { z } from "zod";
import { BuildTransactionResponse, CreateTransactionResponse, TransactionHandler } from "../TransactionHandler";
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { createAssociatedTokenAccountIdempotentInstruction, createTransferInstruction, getAssociatedTokenAddressSync, getMint, transfer } from "@solana/spl-token";
import { connection, prepareTransactions, toRawAmount, validateSolanaAddress } from "../../utils/solana";

const PayloadSchema = z.object({
  toWalletAddress: z.string().nonempty(),
  amount: z.number().positive(),
  tokenAddress: z.string().optional(),
});

type Payload = z.infer<typeof PayloadSchema>;

export class TransferHandler implements TransactionHandler {
  async create(payload: Payload): Promise<CreateTransactionResponse> {
    const validation = PayloadSchema.safeParse(payload);

    if (!validation.success) {
      throw new Error(validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '));
    }

    payload = validation.data;

    validateSolanaAddress(payload.toWalletAddress);

    if (payload.tokenAddress) {
      validateSolanaAddress(payload.tokenAddress);
    }

    return {
      chain: "solana",
      data: payload,
      message: "Token address will be known after transaction is completed",
    };
  }

  async build(data: Payload, publicKey: string): Promise<BuildTransactionResponse> {
    const owner = new PublicKey(publicKey);
    const toWalletAddress = new PublicKey(data.toWalletAddress);

    const tx = new Transaction();

    if (data.tokenAddress) {
      const tokenAddress = new PublicKey(data.tokenAddress);

      const { decimals } = await getMint(connection, tokenAddress);
      const amount = toRawAmount(data.amount, decimals);

      const fromTokenAccount = getAssociatedTokenAddressSync(
        tokenAddress,
        owner,
      );
      const toTokenAccount = getAssociatedTokenAddressSync(
        tokenAddress,
        toWalletAddress,
      );

      if (!await connection.getAccountInfo(toTokenAccount)) {
        tx.add(
          createAssociatedTokenAccountIdempotentInstruction(
            owner,
            toTokenAccount,
            toWalletAddress,
            tokenAddress,
          )
        );
      }

      tx.add(
        createTransferInstruction(
          fromTokenAccount,
          toTokenAccount,
          owner,
          amount.toNumber()
        )
      );
    } else {
      tx.add(
        SystemProgram.transfer({
          fromPubkey: owner,
          toPubkey: toWalletAddress,
          lamports: data.amount * LAMPORTS_PER_SOL
        })
      );
    }

    await prepareTransactions([tx], owner);

    const serializedTransaction = tx.serialize({
      requireAllSignatures: false,
    });

    return {
      transactions: [{
        base64: serializedTransaction.toString('base64'),
        type: "legacy",
      }],
    };
  }
}
