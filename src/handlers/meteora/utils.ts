import { PublicKey, Transaction } from "@solana/web3.js";
import BN from "bn.js";
import Decimal from "decimal.js";
import { connection } from "../../utils/solana";

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
