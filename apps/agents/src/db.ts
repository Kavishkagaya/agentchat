import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "@axon/database";
import type { Env } from "./env";

export function getDb(env: Env) {
  if (!env.NEON_DATABASE_URL) {
    throw new Error("NEON_DATABASE_URL is not set");
  }
  const client = neon(env.NEON_DATABASE_URL);
  return drizzle(client, { schema });
}
