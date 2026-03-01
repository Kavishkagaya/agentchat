import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
// eslint-disable-next-line import/no-namespace
import * as schemaModule from "./schema";

let db: ReturnType<typeof drizzle> | null = null;

export function initDb(connectionString: string) {
  if (!db && connectionString) {
    const client = postgres(connectionString);
    db = drizzle(client, { schema: schemaModule });
  }
  return db;
}

export function getDb() {
  if (!db) {
    // Auto-initialize from process.env for Node.js environments
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const connectionString =
      (globalThis as any).process?.env?.DATABASE_URL || "";
    if (connectionString) {
      initDb(connectionString);
    }

    if (!db) {
      throw new Error(
        "Database not initialized. Call initDb(connectionString) first or set DATABASE_URL env var."
      );
    }
  }
  return db;
}
