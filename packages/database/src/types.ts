import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema> | NeonHttpDatabase<typeof schema>;
