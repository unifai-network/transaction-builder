import "reflect-metadata";
import express, { Request, Response } from "express";
import { DataSource } from "typeorm";
import { Transaction } from "./entity/Transaction";
import { handlerRegistry } from "./handlers";
import { v4 as uuidv4 } from "uuid";

const app = express();
app.use(express.json());

const AppDataSource = new DataSource({
  type: "sqlite",
  database: "db.sqlite",
  entities: [Transaction],
  synchronize: true, // Set to false in production
  logging: false,
});

AppDataSource.initialize()
  .then(async (connection) => {
    console.log("Database connected");

    interface CreateTransactionRequest {
      type: string;
      payload: any;
    }

    app.post("/api/v1/transaction/create", async (req: Request, res: Response) => {
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
        
        await connection.manager.save(transaction);
        
        const baseUrl = `${req.protocol}://${req.get("host")}`;
        res.status(200).json({
          message: `Transaction created, ask the user to approve it at ${baseUrl}/transaction/${txId}`,
        });
      } catch (error) {
        const errorMessage = (error as Error).message;
        res.status(500).json({ error: errorMessage });
      }
    });

    interface BuildTransactionRequest {
      txId: string;
      publicKey: string;
    }
  
    app.post("/api/v1/transaction/build", async (req: Request, res: Response) => {
      try {
        const { txId, publicKey } = req.body as BuildTransactionRequest;
        if (!txId) {
          return res.status(400).json({ error: "Missing transaction ID" });
        }

        const transaction = await connection.manager.findOneBy(Transaction, { id: txId });
        if (!transaction) {
          return res.status(404).json({ error: "Transaction not found" });
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
          res.status(500).json({ error: "Transaction build failed" });
        }
      } catch (error) {
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