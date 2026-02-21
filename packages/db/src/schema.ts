import { pgTable, text, timestamptz, boolean, jsonb, integer } from "drizzle-orm/pg-core";

export const orgs = pgTable("orgs", {
  orgId: text("org_id").primaryKey(),
  name: text("name").notNull(),
  planId: text("plan_id").notNull(),
  createdAt: timestamptz("created_at").notNull(),
  updatedAt: timestamptz("updated_at").notNull()
});

export const orgMembers = pgTable("org_members", {
  orgId: text("org_id").notNull(),
  userId: text("user_id").notNull(),
  role: text("role").notNull(),
  createdAt: timestamptz("created_at").notNull()
});

export const chats = pgTable("chats", {
  chatId: text("chat_id").primaryKey(),
  orgId: text("org_id").notNull(),
  title: text("title").notNull(),
  status: text("status").notNull(),
  isPrivate: boolean("is_private").notNull().default(false),
  agentPolicy: jsonb("agent_policy").notNull(),
  createdBy: text("created_by"),
  createdAt: timestamptz("created_at").notNull(),
  updatedAt: timestamptz("updated_at").notNull(),
  lastActiveAt: timestamptz("last_active_at"),
  archivedAt: timestamptz("archived_at")
});

export const chatMembers = pgTable("chat_members", {
  chatId: text("chat_id").notNull(),
  userId: text("user_id").notNull(),
  role: text("role").notNull(),
  createdAt: timestamptz("created_at").notNull()
});

export const agents = pgTable("agents", {
  agentId: text("agent_id").primaryKey(),
  orgId: text("org_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  config: jsonb("config").notNull(),
  createdAt: timestamptz("created_at").notNull(),
  updatedAt: timestamptz("updated_at").notNull()
});

export const chatAgents = pgTable("chat_agents", {
  chatId: text("chat_id").notNull(),
  agentId: text("agent_id").notNull(),
  createdAt: timestamptz("created_at").notNull()
});

export const chatRuntime = pgTable("chat_runtime", {
  chatId: text("chat_id").primaryKey(),
  chatControllerId: text("chat_controller_id").notNull(),
  status: text("status").notNull(),
  activeSandboxCount: integer("active_sandbox_count").notNull().default(0),
  lastActiveAt: timestamptz("last_active_at"),
  idleAt: timestamptz("idle_at"),
  region: text("region")
});

export const sandboxes = pgTable("sandboxes", {
  sandboxId: text("sandbox_id").primaryKey(),
  chatId: text("chat_id").notNull(),
  status: text("status").notNull(),
  previewHost: text("preview_host").notNull(),
  templateId: text("template_id"),
  sandboxEpoch: integer("sandbox_epoch").notNull().default(0),
  lastHeartbeatAt: timestamptz("last_heartbeat_at"),
  createdAt: timestamptz("created_at").notNull(),
  updatedAt: timestamptz("updated_at").notNull()
});

export const agentRuntimes = pgTable("agent_runtimes", {
  runtimeId: text("runtime_id").primaryKey(),
  chatId: text("chat_id").notNull(),
  agentId: text("agent_id").notNull(),
  status: text("status").notNull(),
  baseUrl: text("base_url").notNull(),
  createdAt: timestamptz("created_at").notNull(),
  updatedAt: timestamptz("updated_at").notNull()
});

export const chatAgentRuntimes = pgTable("chat_agent_runtimes", {
  chatId: text("chat_id").notNull(),
  agentId: text("agent_id").notNull(),
  runtimeId: text("runtime_id").notNull(),
  createdAt: timestamptz("created_at").notNull()
});

export const chatArchives = pgTable("chat_archives", {
  archiveId: text("archive_id").primaryKey(),
  chatId: text("chat_id").notNull(),
  snapshotId: text("snapshot_id").notNull(),
  r2Path: text("r2_path").notNull(),
  createdAt: timestamptz("created_at").notNull()
});

export const chatSnapshots = pgTable("chat_snapshots", {
  snapshotId: text("snapshot_id").primaryKey(),
  chatId: text("chat_id").notNull(),
  r2Path: text("r2_path").notNull(),
  createdAt: timestamptz("created_at").notNull()
});

export const chatTasks = pgTable("chat_tasks", {
  taskId: text("task_id").primaryKey(),
  chatId: text("chat_id").notNull(),
  taskType: text("task_type").notNull(),
  status: text("status").notNull(),
  createdAt: timestamptz("created_at").notNull(),
  updatedAt: timestamptz("updated_at").notNull()
});
