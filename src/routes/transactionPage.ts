import { Router, Request, Response, NextFunction } from "express";
import path from "path";
import { getPendingTransaction } from "../utils/transactionUtils";

const router = Router();
const publicPath = path.join(__dirname, '../../public');

router.get('/:txId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const txId = req.params.txId;
    await getPendingTransaction(txId);
    res.sendFile(path.join(publicPath, 'tx.html'));
  } catch (error) {
    next(error);
  }
});

export default router;
