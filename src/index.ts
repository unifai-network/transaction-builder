import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import "reflect-metadata";
import express from "express";
import cors, { CorsOptions } from "cors";
import transactionApi from './routes/transactionApi';
import { errorHandler } from './middleware/errorHandler';
import path from "path";

const app = express();
const PORT = process.env.PORT || 8001;

app.set('trust proxy', true);

const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    if (origin && process.env.CORS_ALLOW_SUFFIX && origin.endsWith(process.env.CORS_ALLOW_SUFFIX)) {
      return callback(null, origin);
    }
    return callback(null, process.env.FRONTEND_URL || '');
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.use('/api/tx', transactionApi);

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
