import cors from 'cors';
import express, { type Express } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import type { TokenVerifier } from './auth.js';
import type { Db } from './db.js';
import { HttpError, errorHandler, notFoundHandler } from './errors.js';
import { simulatedGateway, type Gateway } from './gateway.js';
import { catalogueRouter } from './routes/catalogue.js';
import { meRouter } from './routes/me.js';
import { orderRouter } from './routes/orders.js';

export interface AppOptions {
  db: Db;
  verifier: TokenVerifier;
  logger: Logger;
  corsOrigins: string[];
  gateway?: Gateway;
  pendingOrderTtlMinutes?: number;
  /** Requests per minute per client for the whole API; money/stock endpoints get a tighter limit. */
  rateLimitPerMinute?: number;
}

const limiter = (max: number) =>
  rateLimit({
    windowMs: 60_000,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new HttpError(429, 'Too many requests', 'Please slow down and try again shortly.')),
  });

export const createApp = (opts: AppOptions): Express => {
  const app = express();
  app.disable('x-powered-by');
  app.use(
    pinoHttp({
      logger: opts.logger,
      quietReqLogger: true,
      // Log only what is needed to trace a request; never headers, bodies or query strings.
      serializers: {
        req: (req: { id: unknown; method: string; url: string }) => ({ id: req.id, method: req.method, url: req.url.split('?')[0] }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  app.use(helmet());
  app.use(
    cors({
      origin: opts.corsOrigins,
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'],
      exposedHeaders: ['Idempotent-Replayed', 'Retry-After'],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: '32kb' }));

  const perMinute = opts.rateLimitPerMinute ?? 300;
  const api = express.Router();
  api.use(limiter(perMinute));
  api.use('/', catalogueRouter(opts.db, opts.verifier));
  api.use('/me', meRouter(opts.db, opts.verifier));
  api.use(
    '/',
    orderRouter(opts.db, opts.verifier, {
      gateway: opts.gateway ?? simulatedGateway,
      pendingOrderTtlMinutes: opts.pendingOrderTtlMinutes ?? 30,
      sensitive: [limiter(Math.max(1, Math.floor(perMinute / 5)))],
    }),
  );
  app.use('/api/v1', api);

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use(notFoundHandler);
  app.use(errorHandler(opts.logger));
  return app;
};
