import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "@agentchat/db";

export function getDb(databaseUrl?: string) {
  if (!databaseUrl) {
    throw new Error("NEON_DATABASE_URL is not set");
  }
  const client = neon(databaseUrl);
  return drizzle(client, { schema });
}
