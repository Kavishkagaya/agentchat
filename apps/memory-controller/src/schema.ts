import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const messages = sqliteTable("messages", {
  message_id: text("message_id").primaryKey(),
  role: text("role").notNull(),
  text: text("text").notNull(),
  agent_id: text("agent_id"),
  sender_id: text("sender_id"),
  sender_name: text("sender_name"),
  agent_nickname: text("agent_nickname"),
  tokens: integer("tokens"),
  created_at: text("created_at").notNull(),
});

export const contextMessages = sqliteTable("context_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  role: text("role").notNull(),
  text: text("text").notNull(),
  tokens: integer("tokens").notNull(),
  created_at: text("created_at").notNull(),
});

export const messageEvents = sqliteTable("message_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  message_id: text("message_id").notNull(),
  event_type: text("event_type").notNull(),
  data: text("data").notNull(),
  created_at: text("created_at").notNull(),
});

// Derived insert/select types for type safety throughout the app
export type MessageInsert = typeof messages.$inferInsert;
export type MessageSelect = typeof messages.$inferSelect;
export type ContextMessageInsert = typeof contextMessages.$inferInsert;
export type ContextMessageSelect = typeof contextMessages.$inferSelect;
export type MessageEventInsert = typeof messageEvents.$inferInsert;
export type MessageEventSelect = typeof messageEvents.$inferSelect;

// Whitelist for archive/restore endpoints — prevents SQL injection via dynamic table names
export const ALLOWED_TABLES = [
  "messages",
  "context_messages",
  "message_events",
] as const;
export type AllowedTable = (typeof ALLOWED_TABLES)[number];
