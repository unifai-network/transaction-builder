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

    const { data, error } = await handler.create(payload);
    if (error) return res.status(400).json({ error });

    const txId = uuidv4();
    await prisma.transaction.create({
      data: {
        id: txId,
        type,
        data: JSON.stringify(data),
        expirationTime: new Date(Date.now() + EXPIRATION_TIME_SECONDS * 1000),
      },
    });

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    res.status(200).json({
      message: `Transaction created, ask the user to approve it at ${baseUrl}/tx/${txId}`,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/build", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { txId, publicKey } = req.body;
    if (!txId) return res.status(400).json({ error: "Missing transaction ID" });

    const transaction = await getPendingTransaction(txId);
    const handler = handlerRegistry.get(transaction.type);
    if (!handler) return res.status(400).json({ error: "Unsupported transaction type" });

    const data = JSON.parse(transaction.data);
    const txn = await handler.build(data, publicKey);

    if (txn) {
      res.json({ success: true, transaction: { type: "versioned", base64: txn } });
    } else {
      throw new Error("Transaction build failed");
    }
  } catch (error) {
    next(error);
  }
});

router.post("/complete", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { txId, txHash } = req.body;
    if (!txId || !txHash) return res.status(400).json({ error: "Missing transaction ID or hash" });

    const transaction = await getPendingTransaction(txId);
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
