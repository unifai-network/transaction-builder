import { Router, Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";
import { PrismaClient } from '@prisma/client';
import { handlerRegistry } from "../handlers";
import { getPendingTransaction } from "../utils/transactionUtils";

const router = Router();
const prisma = new PrismaClient();
const EXPIRATION_TIME_SECONDS = 3600;

router.post("/create", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { type, payload } = req.body;
    if (!type) return res.status(400).json({ error: "Transaction type not specified" });

    const handler = handlerRegistry.get(type);
    if (!handler) return res.status(400).json({ error: "Unsupported transaction type" });

    let chain, data, message, additionalData;
    try {
      ({ chain, data, message, ...additionalData } = await handler.create(payload));
      chain = chain.toLowerCase();
    } catch (error: any) {
      console.error(error);
      return res.status(400).json({ error: error.message || error });
    }

    const txId = `${chain}-${uuidv4()}`;
    await prisma.transaction.create({
      data: {
        id: txId,
        type,
        chain,
        data: JSON.stringify(data),
        expirationTime: new Date(Date.now() + EXPIRATION_TIME_SECONDS * 1000),
      },
    });

    const url = `${process.env.FRONTEND_URL}/tx/${txId}`;

    res.status(200).json({
      message: `Transaction created, ask the user to approve it at ${url} .${message ? ` ${message}` : ""}`,
      ...additionalData,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/get/:txId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { txId } = req.params;

    let transaction;
    try {
      transaction = await getPendingTransaction(txId);
    } catch (error: any) {
      console.error(error);
      return res.status(404).json({ error: error.message || error });
    }

    const data = JSON.parse(transaction.data);

    res.json({
      type: transaction.type,
      chain: transaction.chain,
      data: data,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/build", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { txId, address } = req.body;
    if (!txId) return res.status(400).json({ error: "Missing transaction ID" });

    let transaction;
    try {
      transaction = await getPendingTransaction(txId);
    } catch (error: any) {
      console.error(error);
      return res.status(404).json({ error: error.message || error });
    }

    const handler = handlerRegistry.get(transaction.type);
    if (!handler) return res.status(400).json({ error: "Unsupported transaction type" });

    const data = JSON.parse(transaction.data);
    const chain = transaction.chain;
    const { transactions, ...additionalData } = await handler.build(data, address);

    res.json({
      success: true,
      transactions: transactions.map((txn: any) => ({ ...txn, chain })),
      ...additionalData,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/complete", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { txId, txHash } = req.body;
    if (!txId || !txHash) return res.status(400).json({ error: "Missing transaction ID or hash" });

    try {
      await getPendingTransaction(txId);
    } catch (error: any) {
      console.error(error);
      return res.status(404).json({ error: error.message || error });
    }

    await prisma.transaction.update({
      where: { id: txId },
      data: { txnHash: txHash },
    });

    res.status(200).json({ message: "Transaction completed successfully" });
  } catch (error) {
    next(error);
  }
});

export default router;
