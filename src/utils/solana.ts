import { Connection, clusterApiUrl, PublicKey, Transaction } from '@solana/web3.js';
import BN from 'bn.js';
import Decimal from 'decimal.js';

export const connection = new Connection(process.env.SOLANA_RPC_URL || clusterApiUrl('mainnet-beta'), 'confirmed');

export function validateSolanaAddress(token: string) {
  try {
    new PublicKey(token);
  } catch (error) {
    throw new Error(`${token} is not a valid token address. If it's a ticker or symbol, please try to search for the corresponding token address first or ask user for it.`);
  }
}

export function toRawAmount(
  amount: number | string,
  decimals: number,
): BN {
  const amountD = new Decimal(amount);
  const amountLamports = amountD.mul(new Decimal(10 ** decimals));
  return new BN(amountLamports.toString());
}

export function toUiAmount(
  amount: BN,
  decimals: number,
): string {
  const amountD = new Decimal(amount.toString());
  const uiAmount = amountD.div(new Decimal(10 ** decimals));
  return uiAmount.toString();
}

export async function prepareTransactions(txs: Transaction[], feePayer: PublicKey) {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

  txs.forEach(tx => {
    tx.recentBlockhash = blockhash;
    tx.lastValidBlockHeight = lastValidBlockHeight;
    tx.feePayer = feePayer;
  });
}
