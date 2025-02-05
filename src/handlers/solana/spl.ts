import { z } from 'zod';
import { Keypair, PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { getMinimumBalanceForRentExemptMint, createInitializeMint2Instruction, createMintToInstruction, TOKEN_PROGRAM_ID, MINT_SIZE, createAssociatedTokenAccountInstruction, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { connection, validateSolanaAddress } from '../../utils/solana';
import { TransactionHandler } from "../TransactionHandler";

const PayloadSchema = z.object({
  decimals: z.number().min(0).max(9).default(9),
  freezeAuthority: z.string().optional(),
  mintAuthority: z.string().optional(),
  mintAmount: z.number().min(0).default(1000000000),
});

type Payload = z.infer<typeof PayloadSchema>;

export class SplCreateHandler implements TransactionHandler {
  async create(payload: Payload): Promise<{ chain: string, data: Payload }> {
    const validation = PayloadSchema.safeParse(payload);

    if (!validation.success) {
      throw new Error(validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '));
    }

    payload = validation.data;

    if (payload.freezeAuthority) {
      validateSolanaAddress(payload.freezeAuthority);
    }

    if (payload.mintAuthority) {
      validateSolanaAddress(payload.mintAuthority);
    }

    return {
      chain: "solana",
      data: payload,
    };
  }

  async build(data: Payload, publicKey: string): Promise<Array<{ base64: string, type?: string, tokenAddress: string }>> {
    const pubkey = new PublicKey(publicKey);
    const mintKeypair = Keypair.generate();
    const mintAuthority = data.mintAuthority ? new PublicKey(data.mintAuthority) : pubkey;
    const freezeAuthority = data.freezeAuthority ? new PublicKey(data.freezeAuthority) : null;

    const lamports = await getMinimumBalanceForRentExemptMint(connection);
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

    const tx = new Transaction({
      feePayer: pubkey,
      blockhash,
      lastValidBlockHeight,
    })
    
    tx.add(
      SystemProgram.createAccount({
          fromPubkey: pubkey,
          newAccountPubkey: mintKeypair.publicKey,
          space: MINT_SIZE,
          lamports,
          programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMint2Instruction(
          mintKeypair.publicKey,
          data.decimals,
          mintAuthority,
          freezeAuthority,
          TOKEN_PROGRAM_ID
      )
    );

    if (data.mintAmount) {
      const associatedTokenAccount = getAssociatedTokenAddressSync(
        mintKeypair.publicKey,
        pubkey
      );

      tx.add(
        createAssociatedTokenAccountInstruction(
          pubkey,
          associatedTokenAccount,
          pubkey,
          mintKeypair.publicKey
        ),
        createMintToInstruction(
          mintKeypair.publicKey,
          associatedTokenAccount,
          mintAuthority,
          BigInt(data.mintAmount) * BigInt(10 ** data.decimals),
          [],
          TOKEN_PROGRAM_ID
        )
      );
    }

    tx.sign(mintKeypair);

    const serializedTransaction = tx.serialize({
        requireAllSignatures: false,
    });

    return [{
        base64: serializedTransaction.toString('base64'),
        type: "legacy",
        tokenAddress: mintKeypair.publicKey.toString(),
    }];
  }
}
