import cors from 'cors';
import express from 'express';
import helmet from 'helmet';

import { env } from './config/env.js';
import { httpLogger } from './config/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import analyticsRoutes from './routes/analytics.routes.js';
import healthRoutes from './routes/health.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import protectedRoutes from './routes/protected.routes.js';

const app = express();

app.disable('x-powered-by');

app.use(httpLogger);
app.use(helmet());

app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  }),
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/health', healthRoutes);
app.use('/api/v1/protected', protectedRoutes);
app.use('/api/v1/notifications', notificationRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
