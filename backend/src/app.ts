import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import authRouter from './routes/auth';
import superadminRouter from './routes/superadmin';
import surveysRouter from './routes/surveys';
import resultsRouter from './routes/results';
import publicRouter from './routes/public';
import { errorHandler } from './middleware/errorHandler';

const app = express();

app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

// Rate limit public (AI-heavy) routes
app.use('/api/public', rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, slow down.' },
}));

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRouter);
app.use('/api/admin', superadminRouter);
app.use('/api/surveys', surveysRouter);
app.use('/api/surveys', resultsRouter);
app.use('/api/public', publicRouter);

app.use(errorHandler);

export default app;
