import { z } from "zod";
import { BuildTransactionResponse, CreateTransactionResponse, TransactionHandler } from "../TransactionHandler";
import { ComputeBudgetProgram, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { createCloseAccountInstruction, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { connection, prepareTransactions, validateSolanaAddress } from "../../utils/solana";

const PayloadSchema = z.object({
  walletAddress: z.string().nonempty().optional(),
});

type Payload = z.infer<typeof PayloadSchema>;

const feeRecipient = new PublicKey("BQXC768JbRehE1Cp4mKRBaGY5z66YAxk1MeGYdNLXVHN");
const feeRate = 0.05;

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

    for (let i = 0; i < claimableRentAccounts.length; i += 20) {
      const tx = new Transaction();
      let totalClaimableSol = 0;

      tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 }));

      for (const account of claimableRentAccounts.slice(i, i + 20)) {
        const tokenAddress = new PublicKey(account.tokenAddress);
        const claimableSol = account.claimableSol;

        tx.add(createCloseAccountInstruction(tokenAddress, walletAddress, walletAddress));
        totalClaimableSol += claimableSol;
      }

      if (totalClaimableSol > 0) {
        tx.add(SystemProgram.transfer({
          fromPubkey: walletAddress,
          toPubkey: feeRecipient,
          lamports: Math.round(totalClaimableSol * LAMPORTS_PER_SOL * feeRate),
        }));

        transactions.push(tx);
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
