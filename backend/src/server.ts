import { readFileSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { createOidcVerifier } from './auth.js';
import { loadConfig } from './config.js';
import { createPgDb } from './db.js';
import { createApp } from './app.js';
import { createLogger } from './logger.js';
import { expireStaleOrders } from './orders.js';

const config = loadConfig();
const logger = createLogger(config.logLevel);
const db = createPgDb(config.databaseUrl, config.dbPoolMax);

const app = createApp({
  db,
  logger,
  verifier: createOidcVerifier(config.oidcIssuer, config.oidcAudience),
  corsOrigins: config.corsOrigins,
  pendingOrderTtlMinutes: config.pendingOrderTtlMinutes,
});

// TLS 1.2+ when a key/certificate pair is configured; otherwise plain HTTP on loopback only.
const server =
  config.tlsKeyFile && config.tlsCertFile
    ? createHttpsServer({ key: readFileSync(config.tlsKeyFile), cert: readFileSync(config.tlsCertFile), minVersion: 'TLSv1.2' }, app)
    : createHttpServer(app);

server.listen(config.port, config.host, () => {
  logger.info({ host: config.host, port: config.port, tls: Boolean(config.tlsKeyFile) }, 'API listening');
});

// Release stock and gift points held by unpaid orders.
const sweeper = setInterval(() => {
  db.transaction((tx) => expireStaleOrders(tx, config.pendingOrderTtlMinutes)).then(
    (n) => n > 0 && logger.info({ expired: n }, 'Expired unpaid orders'),
    (err) => logger.error({ err }, 'Failed to expire unpaid orders'),
  );
}, 60_000);
sweeper.unref();

const shutdown = () => {
  clearInterval(sweeper);
  server.close(() => void db.close().then(() => process.exit(0)));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
