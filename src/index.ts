import "reflect-metadata";
import express, { Request, Response } from "express";
import { DataSource } from "typeorm";
import { Transaction } from "./entity/Transaction";
import { handlerRegistry } from "./handlers";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from 'fs';

const app = express();
app.use(express.json());

const publicPath = path.join(__dirname, '../public');
console.log('Static files path:', publicPath);
app.use(express.static(publicPath));

const EXPIRATION_TIME_SECONDS = 3600;

const AppDataSource = new DataSource({
  type: "sqlite",
  database: "db.sqlite",
  entities: [Transaction],
  synchronize: false,
  logging: false,
});

AppDataSource.initialize()
  .then(async (connection) => {
    console.log("Database connected");

    async function getPendingTransaction(connection: DataSource, txId: string): Promise<Transaction> {
      const transaction = await connection.manager.findOneBy(Transaction, { id: txId });

      if (!transaction) {
        throw new Error("Transaction not found");
      }

      if (transaction.expirationTime && transaction.expirationTime < new Date()) {
        throw new Error("Transaction has expired");
      }

      if (transaction.txnHash) {
        throw new Error("Transaction already completed");
      }

      return transaction;
    }

    app.get('/transaction/:txId', async (req: Request, res: Response) => {
      const txId = req.params.txId;
      let transaction: Transaction;
      try {
        transaction = await getPendingTransaction(connection, txId);
      } catch (error) {
        res.status(404).json({ error: (error as Error).message });
        return;
      }

      const htmlPath = path.join(publicPath, 'index.html');
      let html = fs.readFileSync(htmlPath, 'utf8');
      html = html.replace('%%TRANSACTION_ID%%', txId);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    });

    interface CreateTransactionRequest {
      type: string;
      payload: any;
    }

    app.post("/transaction/create", async (req: Request, res: Response) => {
      try {
        const { type, payload } = req.body as CreateTransactionRequest;

        if (!type) {
          return res.status(400).json({ error: "Transaction type not specified" });
        }

        const handler = handlerRegistry.get(type);
        if (!handler) {
          return res.status(400).json({ error: "Unsupported transaction type" });
        }

        const { data, error } = await handler.create(payload);
        if (error) {
          return res.status(400).json({ error: error });
        }

        const txId = uuidv4();
        const transaction = new Transaction();
        transaction.id = txId;
        transaction.type = type;
        transaction.data = JSON.stringify(data);
        transaction.expirationTime = new Date(Date.now() + EXPIRATION_TIME_SECONDS * 1000);
        
        await connection.manager.save(transaction);
        
        const baseUrl = `${req.protocol}://${req.get("host")}`;
        res.status(200).json({
          message: `Transaction created, ask the user to approve it at ${baseUrl}/transaction/${txId}`,
        });
      } catch (error) {
        console.error(error);
        const errorMessage = (error as Error).message;
        res.status(500).json({ error: errorMessage });
      }
    });

    interface BuildTransactionRequest {
      txId: string;
      publicKey: string;
    }
  
    app.post("/transaction/build", async (req: Request, res: Response) => {
      try {
        const { txId, publicKey } = req.body as BuildTransactionRequest;
        if (!txId) {
          return res.status(400).json({ error: "Missing transaction ID" });
        }

        let transaction: Transaction;
        try {
          transaction = await getPendingTransaction(connection, txId);
        } catch (error) {
          return res.status(404).json({ error: (error as Error).message });
        }

        const handler = handlerRegistry.get(transaction.type);
        if (!handler) {
          return res.status(400).json({ error: "Unsupported transaction type" });
        }

        const data = JSON.parse(transaction.data);

        const txn = await handler.build(data, publicKey);

        if (txn) {
          res.json({ success: true, transaction: { type: "versioned", base64: txn } });
        } else {
          console.error("Transaction build failed:");
          res.status(500).json({ error: "Transaction build failed" });
        }
      } catch (error) {
        console.error(error);
        const errorMessage = (error as Error).message;
        res.status(500).json({ error: errorMessage });
      }
    });

    app.post("/transaction/complete", async (req: Request, res: Response) => {
      try {
        const { txId, txHash } = req.body;

        if (!txId || !txHash) {
          return res.status(400).json({ error: "Missing transaction ID or hash" });
        }

        let transaction: Transaction;
        try {
          transaction = await getPendingTransaction(connection, txId);
        } catch (error) {
          return res.status(404).json({ error: (error as Error).message });
        }

        transaction.txnHash = txHash;
        await connection.manager.save(transaction);

        res.status(200).json({ message: "Transaction completed successfully" });
      } catch (error) {
        console.error(error);
        const errorMessage = (error as Error).message;
        res.status(500).json({ error: errorMessage });
      }
    });

    const PORT = process.env.PORT || 8001;
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((error) => console.log("Database connection error:", error));