/**
 * MySQL connection pool (Aiven, SSL) and the query helpers every model uses.
 *
 * Uses the promise API rather than callbacks so the service layer can be
 * written with async/await.
 */

import { readFileSync } from 'node:fs';
import mysql from 'mysql2/promise';
import type {
  Pool,
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from 'mysql2/promise';
import { config } from '../../config.js';

let pool: Pool | null = null;

/** Lazily creates the pool so importing this module never opens a connection. */
export function getPool(): Pool {
  if (pool === null) {
    pool = mysql.createPool({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.database,
      ssl: {
        ca: readFileSync(config.db.sslCaPath),
        rejectUnauthorized: config.db.sslRejectUnauthorized,
      },
      waitForConnections: true,
      connectionLimit: config.db.connectionLimit,
      queueLimit: 0,
    });
  }
  return pool;
}

/** Runs a SELECT and returns the rows. */
export async function query<T extends RowDataPacket = RowDataPacket>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const [rows] = await getPool().query<T[]>(sql, params);
  return rows;
}

/** Runs a SELECT expected to match at most one row. */
export async function queryOne<T extends RowDataPacket = RowDataPacket>(
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

/** Runs an INSERT/UPDATE/DELETE and returns the result header. */
export async function mutate(
  sql: string,
  params: unknown[] = []
): Promise<ResultSetHeader> {
  const [result] = await getPool().query<ResultSetHeader>(sql, params);
  return result;
}

/**
 * Runs `work` inside a transaction, committing on success and rolling back on
 * any thrown error. The connection is always released.
 */
export async function withTransaction<T>(
  work: (connection: PoolConnection) => Promise<T>
): Promise<T> {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/** True when an error came from violating a UNIQUE/PRIMARY KEY constraint. */
export function isDuplicateEntryError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'ER_DUP_ENTRY'
  );
}

/** Verifies the database is reachable. Called once at startup. */
export async function verifyConnection(): Promise<void> {
  const connection = await getPool().getConnection();
  connection.release();
}

/** Closes the pool (used on graceful shutdown). */
export async function closePool(): Promise<void> {
  if (pool !== null) {
    await pool.end();
    pool = null;
  }
}
