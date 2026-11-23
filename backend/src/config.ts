// Runtime configuration. Everything comes from environment variables; nothing sensitive has a default.

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
};

const int = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) throw new Error(`Environment variable ${name} must be a non-negative integer`);
  return n;
};

export interface Config {
  /** Always a loopback address. */
  host: string;
  port: number;
  databaseUrl: string;
  /** Connection pool size (use 1 with the embedded dev database). */
  dbPoolMax: number;
  /** OpenID Connect issuer URL; discovery and JWKS are read from it. */
  oidcIssuer: string;
  oidcAudience: string;
  /** Origins allowed by CORS (the SPA). */
  corsOrigins: string[];
  tlsKeyFile?: string;
  tlsCertFile?: string;
  logLevel: string;
  /** Minutes before an unpaid order expires and its reservation is released. */
  pendingOrderTtlMinutes: number;
}

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1']);

export const loadConfig = (): Config => {
  const host = process.env.HOST ?? '127.0.0.1';
  if (!LOOPBACK.has(host)) {
    throw new Error('HOST must be a loopback address (127.0.0.1); binding to all interfaces is not allowed');
  }
  const tlsKeyFile = process.env.TLS_KEY_FILE;
  const tlsCertFile = process.env.TLS_CERT_FILE;
  if (Boolean(tlsKeyFile) !== Boolean(tlsCertFile)) {
    throw new Error('TLS_KEY_FILE and TLS_CERT_FILE must be set together');
  }
  return {
    host,
    port: int('PORT', 8080),
    databaseUrl: required('DATABASE_URL'),
    dbPoolMax: int('DB_POOL_MAX', 10),
    oidcIssuer: required('OIDC_ISSUER'),
    oidcAudience: process.env.OIDC_AUDIENCE ?? 'urn:bookworm:api',
    corsOrigins: (process.env.CORS_ORIGINS ?? 'http://127.0.0.1:5173')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    tlsKeyFile,
    tlsCertFile,
    logLevel: process.env.LOG_LEVEL ?? 'info',
    pendingOrderTtlMinutes: int('PENDING_ORDER_TTL_MINUTES', 30),
  };
};
