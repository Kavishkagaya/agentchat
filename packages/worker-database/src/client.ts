import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schemaModule from "./schema/schema";
import * as relationsModule from "./schema/relations";

const schema = { ...schemaModule, ...relationsModule };

let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function initDb(connectionString: string) {
  if (!db && connectionString) {
    const client = neon(connectionString);
    db = drizzle(client, { schema });
  }
  return db;
}

export function getDb() {
  if (!db) {
    throw new Error("Database not initialized. Call initDb(connectionString) first.");
  }
  return db;
}
