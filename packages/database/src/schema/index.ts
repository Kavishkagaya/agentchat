import type { AgentConfigJson, ChatRoutingConfig } from "@axon/shared";
import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// --- Users ---

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(), // Internal DB ID (e.g. uuid)
    clerkId: text("clerk_id").notNull(), // Clerk User ID
    email: text("email").notNull(),
    password: text("password"), // Sync if available
    firstName: text("first_name"),
    lastName: text("last_name"),
    imageUrl: text("image_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    role: text("role").notNull().default("user"), // 'user' , 'admin'
  },
  (table) => ({
    clerkIdIdx: uniqueIndex("users_clerk_id_idx").on(table.clerkId),
    emailIdx: uniqueIndex("users_email_idx").on(table.email),
  }),
);

// --- Organizations ---

export const orgs = pgTable(
  "orgs",
  {
    id: text("id").primaryKey(), // Internal DB ID
    clerkId: text("clerk_id").notNull(), // Clerk Org ID
    name: text("name").notNull(),
    planId: text("plan_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    clerkIdIdx: uniqueIndex("orgs_clerk_id_idx").on(table.clerkId),
  }),
);

export const orgMembers = pgTable(
  "org_members",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => orgs.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    clerkOrgId: text("clerk_org_id"),
    clerkUserId: text("clerk_user_id"),
    role: text("role").notNull(), // 'owner', 'member', 'admin'
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    orgUserUnique: uniqueIndex("org_members_org_user_idx").on(
      table.orgId,
      table.userId,
    ),
    userIdIdx: index("org_members_user_id_idx").on(table.userId),
    clerkOrgIdIdx: index("org_members_clerk_org_id_idx").on(table.clerkOrgId),
    clerkUserIdIdx: index("org_members_clerk_user_id_idx").on(
      table.clerkUserId,
    ),
  }),
);

// --- Configs (Memory/Execution Contexts) ---

export const chats = pgTable(
  "chats",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => orgs.id),
    title: text("title").notNull(),
    status: text("status").notNull(), // 'active', 'idle', 'archived'
    isPrivate: boolean("is_private").notNull().default(false),
    // Canonical workspace/group config payload (history mode, archive policy, agent policy, runtime flags).
    config: jsonb("config").$type<ChatRoutingConfig>().notNull(),
    // Legacy projection kept for compatibility while group config converges on `config`.
    agentPolicy: jsonb("agent_policy")
      .$type<Record<string, unknown>>()
      .notNull(),
    createdBy: text("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => ({
    orgIdIdx: index("chats_org_id_idx").on(table.orgId),
  }),
);

export const chatsRelations = relations(chats, ({ many }) => ({
  members: many(chatMembers),
  agents: many(chatAgents),
}));

export const chatMembers = pgTable(
  "chat_members",
  {
    configId: text("config_id")
      .notNull()
      .references(() => chats.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role").notNull(), // 'owner', 'member'
    addedBy: text("added_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.configId, table.userId] }),
    userIdIdx: index("chat_members_user_id_idx").on(table.userId),
  }),
);

export const chatMembersRelations = relations(chatMembers, ({ one }) => ({
  config: one(chats, {
    fields: [chatMembers.configId],
    references: [chats.id],
  }),
}));

// --- Agents ---

export const agents = pgTable(
  "agents",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => orgs.id),
    modelId: text("model_id"),
    name: text("name").notNull(),
    description: text("description"),
    config: jsonb("config").$type<AgentConfigJson>().notNull(),
    visibility: text("visibility").notNull(), // 'public', 'private'
    createdBy: text("created_by").references(() => users.id),
    parentAgentId: text("parent_agent_id"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    orgIdIdx: index("agents_org_id_idx").on(table.orgId),
  }),
);

export const chatAgents = pgTable(
  "chat_agents",
  {
    configId: text("config_id")
      .notNull()
      .references(() => chats.id),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id),
    addedBy: text("added_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.configId, table.agentId] }),
  }),
);

export const chatAgentsRelations = relations(chatAgents, ({ one }) => ({
  config: one(chats, {
    fields: [chatAgents.configId],
    references: [chats.id],
  }),
  agent: one(agents, {
    fields: [chatAgents.agentId],
    references: [agents.id],
  }),
}));

// --- Skills ---

export const skills = pgTable(
  "skills",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => orgs.id),
    name: text("name").notNull(),
    description: text("description"),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    orgIdIdx: index("skills_org_id_idx").on(table.orgId),
  }),
);

export const skillsRelations = relations(skills, ({ one }) => ({
  org: one(orgs, {
    fields: [skills.orgId],
    references: [orgs.id],
  }),
}));

// --- MCP Servers ---

export const mcpServers = pgTable(
  "mcp_servers",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => orgs.id),
    name: text("name").notNull(),
    url: text("url").notNull(),
    token: text("token").notNull(),
    secretRef: text("secret_ref"),
    config: jsonb("config").$type<Record<string, unknown>>().notNull(),
    status: text("status").notNull().default("pending"), // 'pending' | 'valid' | 'error'
    errorMessage: text("error_message"),
    lastValidatedAt: timestamp("last_validated_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    orgIdIdx: index("mcp_servers_org_id_idx").on(table.orgId),
    statusIdx: index("mcp_servers_status_idx").on(table.status),
  }),
);

export const mcpServersRelations = relations(mcpServers, ({ one }) => ({
  org: one(orgs, {
    fields: [mcpServers.orgId],
    references: [orgs.id],
  }),
  createdBy: one(users, {
    fields: [mcpServers.createdBy],
    references: [users.id],
  }),
}));

// --- Runtime Routing ---

export const chatRuntime = pgTable("chat_runtime", {
  configId: text("config_id")
    .primaryKey()
    .references(() => chats.id),
  groupControllerId: text("group_controller_id").notNull(), // Durable Object ID string
  status: text("status").notNull(), // 'active', 'idle'
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
  idleAt: timestamp("idle_at", { withTimezone: true }),
  region: text("region"),
  publicKey: text("public_key"), // Session Public Key for Chain of Trust verification
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const agentRuntimes = pgTable(
  "agent_runtimes",
  {
    id: text("id").primaryKey(),
    configId: text("config_id")
      .notNull()
      .references(() => chats.id),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id),
    status: text("status").notNull(),
    baseUrl: text("base_url").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    groupIdIdx: index("agent_runtimes_group_id_idx").on(table.configId),
  }),
);

export const chatAgentRuntimes = pgTable(
  "chat_agent_runtimes",
  {
    configId: text("config_id")
      .notNull()
      .references(() => chats.id),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id),
    runtimeId: text("runtime_id")
      .notNull()
      .references(() => agentRuntimes.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.configId, table.agentId, table.runtimeId],
    }),
  }),
);

// --- Lifecycle & Archive ---

export const chatArchives = pgTable(
  "chat_archives",
  {
    id: text("id").primaryKey(),
    configId: text("config_id")
      .notNull()
      .references(() => chats.id),
    snapshotId: text("snapshot_id").notNull(),
    r2Path: text("r2_path").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    groupIdIdx: index("chat_archives_group_id_idx").on(table.configId),
  }),
);

export const chatSnapshots = pgTable(
  "chat_snapshots",
  {
    id: text("id").primaryKey(),
    configId: text("config_id")
      .notNull()
      .references(() => chats.id),
    r2Path: text("r2_path").notNull(),
    sizeBytes: integer("size_bytes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    groupIdIdx: index("chat_snapshots_group_id_idx").on(table.configId),
  }),
);

// --- Secrets ---

export const secrets = pgTable(
  "secrets",
  {
    id: text("secret_id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => orgs.id),
    name: text("name").notNull(),
    namespace: text("namespace").notNull(), // 'agent'
    ciphertext: text("ciphertext").notNull(),
    version: integer("version").notNull().default(1),
    createdBy: text("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    rotatedAt: timestamp("rotated_at", { withTimezone: true }),
  },
  (table) => ({
    orgIdIdx: index("secrets_org_id_idx").on(table.orgId),
    orgIdIdIdx: index("secrets_org_id_id_idx").on(table.orgId, table.id),
  }),
);

export const modelCatalog = pgTable(
  "model_catalog",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => orgs.id),
    name: text("name").notNull(),
    modelType: text("model_type").notNull(), // e.g. 'cloudflare_ai_gateway'
    kind: text("kind").notNull(), // e.g. 'openai', 'gemini'
    modelId: text("model_id").notNull(),
    secretRef: text("secret_ref")
      .notNull()
      .references(() => secrets.id),
    gatewayAccountId: text("gateway_account_id").notNull(),
    gatewayId: text("gateway_id").notNull(),
    config: jsonb("config").$type<Record<string, unknown>>().notNull(),
    createdBy: text("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    orgIdIdx: index("model_catalog_org_id_idx").on(table.orgId),
    modelTypeIdx: index("model_catalog_model_type_idx").on(table.modelType),
  }),
);

// --- Billing ---

export const orgUsage = pgTable(
  "org_usage",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => orgs.id),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    concurrentGroupsPeak: integer("concurrent_groups_peak"),
  },
  (table) => ({
    orgIdIdx: index("org_usage_org_id_idx").on(table.orgId),
  }),
);

export const orgLimits = pgTable("org_limits", {
  orgId: text("org_id")
    .primaryKey()
    .references(() => orgs.id),
  maxStorageGb: integer("max_storage_gb"),
  maxEgressGb: integer("max_egress_gb"),
});

export const subscriptions = pgTable("subscriptions", {
  orgId: text("org_id")
    .primaryKey()
    .references(() => orgs.id),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  status: text("status"),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

// --- System Configuration ---

export const systemConfigs = pgTable("system_configs", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

// --- Audit ---

export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").references(() => orgs.id),
    actorUserId: text("actor_user_id").references(() => users.id),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    orgIdIdx: index("audit_log_org_id_idx").on(table.orgId),
    actorUserIdIdx: index("audit_log_actor_user_id_idx").on(table.actorUserId),
  }),
);
