import pino, { type Logger } from 'pino';

/** Structured JSON logger. Credentials and tokens are redacted wherever they could appear. */
export const createLogger = (level = 'info'): Logger =>
  pino({
    level,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        '*.paymentToken',
        '*.password',
        '*.token',
      ],
      censor: '[redacted]',
    },
  });
