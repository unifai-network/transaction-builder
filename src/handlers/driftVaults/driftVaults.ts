import { z } from "zod";
import { TransactionHandler, CreateTransactionResponse, BuildTransactionResponse } from "../TransactionHandler";
import { Keypair, PublicKey } from '@solana/web3.js';
import { getMint } from "@solana/spl-token";
import { connection, validateSolanaAddress } from '../../utils/solana';
import { VaultClient, getVaultDepositorAddressSync, DriftVaults, getDriftVaultProgram } from '@drift-labs/vaults-sdk';
import { Program, Wallet } from '@coral-xyz/anchor';
import {
	BN,
	DriftClient,
} from '@drift-labs/sdk';
import * as anchor from '@coral-xyz/anchor';



const PayloadSchema = z.object({
  vaultAddress: z.string().nonempty("Missing required field: vaultAddress"),
  userTokenAddress: z.string().nonempty("Missing required field: userTokenAddress"), 
  amount: z.union([
    z.string().nonempty("Missing required field: amount"),
    z.number().positive("Amount must be positive"), 
  ]),
  action: z.enum(['deposit', 'redeem'], {
     errorMap: () => ({ message: "Action must be one of: deposit, redeem" })
  }),
});

type Payload = z.infer<typeof PayloadSchema>;

export class DriftVaultsHandler implements TransactionHandler {
  async create(payload: Payload): Promise<CreateTransactionResponse> {
    const validation = PayloadSchema.safeParse(payload);

    if (!validation.success) {
      throw new Error(validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '));
    }

    payload = validation.data;
    validateSolanaAddress(payload.vaultAddress)
    validateSolanaAddress(payload.userTokenAddress)

    return {
      chain: "solana",
      data: payload,
    };
  }
  

  async build(data: Payload, publicKey: string): Promise<BuildTransactionResponse> {
    validateSolanaAddress(publicKey)

    const wallet = new Wallet(Keypair.generate());
    const userPublicKey = new PublicKey(publicKey);
    
    // driftVaults programId
    const programId = new PublicKey('JCNCMFXo5M5qwUPg2Utu1u6YWp3MbygxqBsBeXXJfrw');
    
    const program :anchor.Program<DriftVaults> = getDriftVaultProgram(connection, wallet)
    
    const driftClient = new DriftClient({
      connection: connection,
      wallet: wallet,
      opts: {
        commitment: 'confirmed',
      },
      txVersion: 0,
    });

    
    const vaultClient = new VaultClient({
      driftClient,
      program,
    });
  
    let token;
    try {
      token = await getMint(connection, new PublicKey(data.userTokenAddress));
    } catch (error) {
      throw new Error(`Failed to get tokenInfo ${data.userTokenAddress} `);
    }
    const amountBN = new BN(data.amount, 10).mul(new BN(10).pow(new BN(6)));
     
    const vaultDepositor = 
          getVaultDepositorAddressSync(programId, new PublicKey(data.vaultAddress), userPublicKey)

    let txn;   
    try {
      if(data.action === 'deposit') {
        txn = await vaultClient.createDepositTx(
          vaultDepositor,
          amountBN,
          {
           authority: userPublicKey,
           vault: new PublicKey(data.vaultAddress),
          },
          undefined,
          new PublicKey(data.userTokenAddress)
        )
        console.log(txn);
      } else {
        const redeemIxs = await vaultClient.createRedeemTokensIx(
          vaultDepositor,
          amountBN,
        )
        txn = await vaultClient.createTxn([redeemIxs]);
      } 
      const serializedTxn = Buffer.from(txn.serialize()).toString('base64');

      return {
        transactions: [{
          type: "versioned",
          base64: serializedTxn,
      }],
      };    
    } catch (error) {
      throw new Error(`Failed to build ${data.action} transaction: ${error}`);
    } 
    
  }
    
}


