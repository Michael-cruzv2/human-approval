import "server-only";

import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import { getAppConfig } from "@/lib/server/config";

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    const env = getAppConfig().env;
    const target = env.DATABASE_TARGET ?? (env.NODE_ENV === "production" ? "main" : "child");
    const DATABASE_URL = target === "child" ? env.DATABASE_CHILD_URL : env.DATABASE_URL;
    if (!DATABASE_URL) throw new Error("Selected database URL is not configured.");
    pool = new Pool({
      connectionString: DATABASE_URL,
      max: 5,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      application_name: "lead-review-app",
    });
    pool.on("error", () => {
      // Never log connection details or query values.
    });
  }
  return pool;
}

export async function query<Row extends QueryResultRow = QueryResultRow>(
  text: string,
  values: readonly unknown[] = [],
): Promise<QueryResult<Row>> {
  return getPool().query<Row>(text, [...values]);
}

export async function withTransaction<T>(
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

const REQUIRED_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  users: ["id", "email", "name", "role", "is_active"],
  audit_log: ["actor_type", "actor_id", "entity", "entity_id", "action", "details"],
  auth_otp_codes: [
    "id",
    "email",
    "user_id",
    "code_hash",
    "attempts",
    "expires_at",
    "consumed_at",
    "invalidated_at",
    "request_ip",
    "created_at",
  ],
  auth_sessions: [
    "id",
    "user_id",
    "token_hash",
    "created_at",
    "last_seen_at",
    "expires_at",
    "revoked_at",
    "ip",
    "user_agent",
  ],
  auth_verify_attempts: [
    "id",
    "email_hash",
    "request_ip",
    "attempted_at",
    "email_locked_until",
    "ip_locked_until",
  ],
};

export class MissingSchemaError extends Error {}

export async function assertRequiredSchema(): Promise<void> {
  const tableNames = Object.keys(REQUIRED_COLUMNS);
  const result = await query<{ table_name: string; column_name: string }>(
    `SELECT table_name, column_name
       FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = ANY($1::text[])`,
    [tableNames],
  );
  const present = new Set(result.rows.map((row) => `${row.table_name}.${row.column_name}`));
  const missing = Object.entries(REQUIRED_COLUMNS).flatMap(([table, columns]) =>
    columns.filter((column) => !present.has(`${table}.${column}`)).map((column) => `${table}.${column}`),
  );
  if (missing.length > 0) {
    throw new MissingSchemaError(
      `Database schema is missing required objects: ${missing.join(", ")}`,
    );
  }
}
