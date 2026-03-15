// Conditionally import dotenv for non-worker environments
if (
  typeof (globalThis as any).process !== "undefined" &&
  (globalThis as any).process.env &&
  !(globalThis as any).process.env.WORKER
) {
  // Use a self-executing async function or similar to avoid top-level await issues in CJS
  (async () => {
    try {
      // Hide from static analysis to prevent bundling issues in workers
      const mod = "dotenv/config";
      // @ts-expect-error
      await import(mod);
    } catch (e) {
      // Ignore error if dotenv is not available
    }
  })();
}

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
// eslint-disable-next-line import/no-namespace
import * as schemaModule from "./schema";

let db: ReturnType<typeof drizzle<typeof schemaModule>> | null = null;

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
        "Database not initialized. Call initDb(connectionString) first or set DATABASE_URL env var.",
      );
    }
  }
  return db;
}
