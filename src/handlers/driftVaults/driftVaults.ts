import { z } from "zod";
import { TransactionHandler, CreateTransactionResponse, BuildTransactionResponse } from "../TransactionHandler";
import { Keypair, PublicKey, Connection, AddressLookupTableAccount, TransactionInstruction } from '@solana/web3.js';
import { getMint, getAccount } from "@solana/spl-token";
import { connection, validateSolanaAddress } from '../../utils/solana';
import { VaultClient, getVaultDepositorAddressSync, 
  DriftVaults, getDriftVaultProgram, Vault, WithdrawUnit } from '@drift-labs/vaults-sdk';
import { Wallet } from '@coral-xyz/anchor';
import {
	BN,
	DriftClient,
  getUserStatsAccountPublicKey,
  UserStatsAccount,
  UserAccount,
  FuelOverflowStatus,
  getFuelOverflowAccountPublicKey,
  OracleSource
} from '@drift-labs/sdk';
import * as anchor from '@coral-xyz/anchor';

const PayloadSchema = z.object({
  vaultAddress: z.string().nonempty("Missing required field: vaultAddress"),
  amount: z.number().positive("Amount must be a positive number"),
  action: z.enum(['deposit', 'withdraw'], {
     errorMap: () => ({ message: "Action must be one of: deposit, redeem" })
  }),
});

type TxParams = {
	cuLimit?: number;
	cuPriceMicroLamports?: number;
	simulateTransaction?: boolean;
	lookupTables?: AddressLookupTableAccount[];
	oracleFeedsToCrank?: { feed: PublicKey; oracleSource: OracleSource }[];
	noLut?: boolean;
};

type Payload = z.infer<typeof PayloadSchema>;

export class DriftVaultsHandler implements TransactionHandler {
  async create(payload: Payload): Promise<CreateTransactionResponse> {
    const validation = PayloadSchema.safeParse(payload);

    if (!validation.success) {
      throw new Error(validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '));
    }

    payload = validation.data;
    validateSolanaAddress(payload.vaultAddress);

    return {
      chain: "solana",
      data: payload,
    };
  }
  

  async build(data: Payload, publicKey: string): Promise<BuildTransactionResponse> {
    validateSolanaAddress(publicKey)

    const wallet = new Wallet(Keypair.generate());
    const userPublicKey = new PublicKey(publicKey);
    const vaultPublicKey = new PublicKey(data.vaultAddress);
    
    const driftVaultsProgramId = new PublicKey(`JCNCMFXo5M5qwUPg2Utu1u6YWp3MbygxqBsBeXXJfrw`);
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

    driftClient.subscribe();

    let amountBN;
    try {
      const vault = await vaultClient.getVault(vaultPublicKey);
      const tokenInfo = await getAccount(connection, vault.tokenAccount);
      const mint = tokenInfo.mint;
      const token = await getMint(connection, mint);
      amountBN = new BN(data.amount * (10 ** token.decimals));
    } catch (error) {
      throw new Error(`failed to calculate token amount`);
    }
     
    // initialize the vault depositor account if it doesn't exist
    const vaultDepositor = 
          getVaultDepositorAddressSync(driftVaultsProgramId, new PublicKey(data.vaultAddress), userPublicKey)
    const accountInfo = await connection.getAccountInfo(vaultDepositor);
    const needsInitVaultDepositor = accountInfo === null;      

    let txn;   
    try {
      if(data.action === 'deposit') {
        txn = await vaultClient.createDepositTx(
          vaultDepositor,
          amountBN,
          needsInitVaultDepositor ? {
            authority: userPublicKey,
            vault: vaultPublicKey
          } : undefined,
          undefined,
          undefined
        )
      } else {
        const vaultAccount = await program.account.vault.fetch(vaultPublicKey);
        const user = vaultClient.getSubscribedVaultUser(vaultAccount.user);
        const userStatsKey = getUserStatsAccountPublicKey(
          driftVaultsProgramId,
          vaultPublicKey
        );

        const userStats = (await driftClient.program.account.userStats.fetch(
          userStatsKey
        )) as UserStatsAccount;

        const remainingAccounts = this.getRemainingAccountsForUser(
          [(await user).getUserAccount()],
          [],
          vaultAccount,
          userStats,
          driftClient
        );
        
        const oracleFeedsToCrankIxs = await this.getOracleFeedsToCrank(
           undefined, driftClient
        );
        
        const accounts = {
           vault: vaultPublicKey,
           vaultDepositor,
           driftUser: vaultAccount.user,
           driftUserStats: userStatsKey,
        };

        const requestWithdrawIx = program.instruction.requestWithdraw(
           amountBN,
           WithdrawUnit.TOKEN,
           {
            accounts: {
              authority: driftClient.wallet.publicKey,
              ...accounts,
            },
           remainingAccounts,
        });

        const instructions = [...oracleFeedsToCrankIxs, requestWithdrawIx];
        txn = await vaultClient.createTxn(instructions);
        
      } 
      if (!txn) {
        throw new Error("Transaction is undefined or invalid");
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
    

  private getRemainingAccountsForUser(
    userAccounts: UserAccount[],
    writableSpotMarketIndexes: number[],
    vaultAccount: Vault,
    userStats: UserStatsAccount,
    driftClient: DriftClient
  ) {
    const remainingAccounts = driftClient.getRemainingAccounts({
      userAccounts,
      writableSpotMarketIndexes,
    });

    const hasFuelOverflow = (userStats.fuelOverflowStatus & FuelOverflowStatus.Exists) ===
       FuelOverflowStatus.Exists;

    if (hasFuelOverflow) {
       const fuelOverflow = getFuelOverflowAccountPublicKey(
         driftClient.program.programId,
         vaultAccount.pubkey
       );
       remainingAccounts.push({
         pubkey: fuelOverflow,
         isSigner: false,
         isWritable: false,
       });
    }

    remainingAccounts.push({
      pubkey: vaultAccount.pubkey,
      isSigner: false,
      isWritable: true,
    });

    return remainingAccounts;
  }

  private async getOracleFeedsToCrank(
		oracleFeedsToCrank: TxParams['oracleFeedsToCrank'],
    driftClient: DriftClient
	) {
		const oracleFeedsToCrankIxs: TransactionInstruction[] = oracleFeedsToCrank
			? ((await Promise.all(
					oracleFeedsToCrank.map(async (feedConfig) => {
						if (
							JSON.stringify(feedConfig.oracleSource) !==
							JSON.stringify(OracleSource.SWITCHBOARD_ON_DEMAND)
						) {
							throw new Error(
								'Only SWITCHBOARD_ON_DEMAND oracle feeds are supported for cranking'
							);
						}

						return driftClient.getPostSwitchboardOnDemandUpdateAtomicIx(
							feedConfig.feed
						);
					})
			  )) as TransactionInstruction[])
			: [];

		return oracleFeedsToCrankIxs;
	}
}





