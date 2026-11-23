import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import type { Db, Queryable } from './db.js';
import { HttpError, unprocessable } from './errors.js';
import { idempotencyKey, parse } from './validate.js';

export interface HandlerResult {
  status: number;
  body: unknown;
}

/**
 * Runs `handler` in a transaction. With an `Idempotency-Key` header, the response is stored in the same
 * transaction, so a retry with the same key and payload replays it instead of repeating the side effects.
 */
export const withIdempotency = async (
  db: Db,
  req: Request,
  res: Response,
  userId: string,
  scope: string,
  handler: (tx: Queryable) => Promise<HandlerResult>,
): Promise<void> => {
  const header = req.header('Idempotency-Key');
  if (header === undefined) {
    const out = await db.transaction(handler);
    res.status(out.status).json(out.body);
    return;
  }
  const key = parse(idempotencyKey, header);
  const hash = createHash('sha256').update(JSON.stringify(req.body ?? null)).digest('hex');

  const [stored] = await db.query<{ request_hash: string; status_code: number; response: unknown }>(
    'SELECT request_hash, status_code, response FROM idempotency_keys WHERE user_id = $1 AND scope = $2 AND key = $3',
    [userId, scope, key],
  );
  if (stored) {
    if (stored.request_hash !== hash) throw unprocessable('This Idempotency-Key was already used with a different request.');
    res.setHeader('Idempotent-Replayed', 'true').status(stored.status_code).json(stored.response);
    return;
  }

  try {
    const out = await db.transaction(async (tx) => {
      const result = await handler(tx);
      await tx.query(
        'INSERT INTO idempotency_keys (user_id, scope, key, request_hash, status_code, response) VALUES ($1, $2, $3, $4, $5, $6)',
        [userId, scope, key, hash, result.status, JSON.stringify(result.body)],
      );
      return result;
    });
    res.status(out.status).json(out.body);
  } catch (err) {
    // A concurrent request with the same key committed first.
    if ((err as { code?: string }).code === '23505' && String((err as Error).message).includes('idempotency_keys')) {
      throw new HttpError(409, 'Conflict', 'A request with this Idempotency-Key is already being processed.');
    }
    throw err;
  }
};
