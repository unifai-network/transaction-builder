import { PrismaClient, Transaction } from '@prisma/client';

const prisma = new PrismaClient();

export async function getPendingTransaction(txId: string): Promise<Transaction> {
  const transaction = await prisma.transaction.findUnique({
    where: { id: txId },
  });

  if (!transaction) throw new Error("Transaction not found");
  if (transaction.expirationTime && transaction.expirationTime < new Date()) throw new Error("Transaction has expired");
  if (transaction.txnHash) throw new Error("Transaction already completed");

  return transaction;
}
