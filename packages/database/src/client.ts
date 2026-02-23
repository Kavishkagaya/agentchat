import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = (globalThis as any).process?.env?.DATABASE_URL || "";

// Standard client for Node.js environments
const client = postgres(connectionString);
export const db = drizzle(client, { schema });

export { schema };
