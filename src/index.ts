import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import "reflect-metadata";
import express from "express";
import transactionApi from './routes/transactionApi';
import transactionPage from './routes/transactionPage';
import { errorHandler } from './middleware/errorHandler';
import path from "path";

const app = express();
const PORT = process.env.PORT || 8001;

app.set('trust proxy', true);

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.use('/api/tx', transactionApi);
app.use('/tx', transactionPage);

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
