import { z } from "zod";
import { BuildTransactionResponse, CreateTransactionResponse, TransactionHandler } from "../TransactionHandler";
import { ComputeBudgetProgram, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { createCloseAccountInstruction, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { connection, prepareTransactions, validateSolanaAddress } from "../../utils/solana";

const PayloadSchema = z.object({
  walletAddress: z.string().nonempty().optional(),
  language: z.enum(["en", "zh"]).optional(),
});

type Payload = z.infer<typeof PayloadSchema>;

const feeRecipient = process.env.SOLANA_RENT_FEE_RECIPIENT ? new PublicKey(process.env.SOLANA_RENT_FEE_RECIPIENT) : null;
const feeRate = process.env.SOLANA_RENT_FEE_RATE ? parseFloat(process.env.SOLANA_RENT_FEE_RATE) : 0;

export class ReclaimSolRentHandler implements TransactionHandler {
  async create(payload: Payload): Promise<CreateTransactionResponse> {
    const validation = PayloadSchema.safeParse(payload);

    if (!validation.success) {
      throw new Error(validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '));
    }

    payload = validation.data;

    if (payload.walletAddress) {
      validateSolanaAddress(payload.walletAddress);

      const claimableRentAccounts = await getClaimableRentAccounts(new PublicKey(payload.walletAddress));

      if (claimableRentAccounts.length === 0) {
        throw new Error("No claimable rent accounts found");
      }
    }

    return {
      chain: "solana",
      data: payload,
    };
  }

  async build(data: Payload, publicKey: string): Promise<BuildTransactionResponse> {
    const walletAddress = new PublicKey(publicKey);
    const claimableRentAccounts = await getClaimableRentAccounts(walletAddress);

    if (claimableRentAccounts.length === 0) {
      throw new Error("No claimable rent accounts found");
    }

    const transactions: Transaction[] = [];
    let totalClaimableSol = 0;
    let totalClaimableAccounts = 0;
    for (let i = 0; i < claimableRentAccounts.length; i += 20) {
      const tx = new Transaction();
      let txClaimableSol = 0;

      tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 }));

      for (const account of claimableRentAccounts.slice(i, i + 20)) {
        const tokenAddress = new PublicKey(account.tokenAddress);
        const claimableSol = account.claimableSol;

        tx.add(createCloseAccountInstruction(tokenAddress, walletAddress, walletAddress));
        txClaimableSol += claimableSol;
        totalClaimableSol += claimableSol;
        totalClaimableAccounts++;
      }

      if (txClaimableSol > 0 && feeRecipient && feeRate > 0) {
        tx.add(SystemProgram.transfer({
          fromPubkey: walletAddress,
          toPubkey: feeRecipient,
          lamports: Math.round(txClaimableSol * LAMPORTS_PER_SOL * feeRate),
        }));

        transactions.push(tx);

        totalClaimableSol -= txClaimableSol * feeRate;
      }
    }

    await prepareTransactions(transactions, walletAddress);

    return {
      transactions: transactions.map(tx => ({
        base64: tx.serialize({
          requireAllSignatures: false,
        }).toString('base64'),
        type: "legacy",
      })),
      data: {
        language: data.language,
        totalClaimableSol,
        totalClaimableAccounts,
      },
    };
  }
}

async function getClaimableRentAccounts(walletAddress: PublicKey) {
  const result: {
    tokenAddress: string;
    tokenMint: string;
    claimableSol: number;
  }[] = [];

  await connection.getParsedTokenAccountsByOwner(walletAddress, { programId: TOKEN_PROGRAM_ID }).then(res => {
    for (const token of res.value) {
      const { isNative, state, tokenAmount, mint } = token.account.data.parsed.info;

      if (isNative || state !== 'initialized') {
        continue;
      }

      if (tokenAmount.amount == 0) {
        result.push({
          tokenAddress: token.pubkey.toString(),
          tokenMint: mint.toString(),
          claimableSol: token.account.lamports / LAMPORTS_PER_SOL,
        })
      }
    }
  });

  return result;
}
