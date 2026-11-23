import { Pool, type PoolClient } from 'pg';

/** Minimal database surface used by the app, implemented for `pg` (runtime) and PGlite (tests). */
export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface Db extends Queryable {
  /** Runs `fn` in a transaction; commits on success and rolls back if it throws. */
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const wrapClient = (client: PoolClient): Queryable => ({
  query: async <T>(sql: string, params: unknown[] = []) => (await client.query(sql, params)).rows as T[],
});

export const createPgDb = (connectionString: string, max = 10): Db => {
  const pool = new Pool({ connectionString, max, connectionTimeoutMillis: 5_000, statement_timeout: 15_000 });
  return {
    query: async <T>(sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows as T[],
    transaction: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(wrapClient(client));
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
};
