import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@axon/database";
import type { Db } from "@axon/database";

let pool: Pool | undefined;
let db: Db | undefined;

export function getDb(): Db {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }

  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }

  if (!db) {
    // @ts-ignore - casting to generic Db
    db = drizzle(pool, { schema }) as unknown as Db;
  }

  return db;
}