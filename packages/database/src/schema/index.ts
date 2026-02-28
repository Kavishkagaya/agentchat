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
  })
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
  })
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
      table.userId
    ),
    userIdIdx: index("org_members_user_id_idx").on(table.userId),
    clerkOrgIdIdx: index("org_members_clerk_org_id_idx").on(table.clerkOrgId),
    clerkUserIdIdx: index("org_members_clerk_user_id_idx").on(
      table.clerkUserId
    ),
  })
);

// --- Groups (Persistent Chat Rooms) ---

export const groups = pgTable(
  "groups",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => orgs.id),
    title: text("title").notNull(),
    status: text("status").notNull(), // 'active', 'idle', 'archived'
    isPrivate: boolean("is_private").notNull().default(false),
    // Canonical workspace/group config payload (history mode, archive policy, agent policy, runtime flags).
    config: jsonb("config").notNull(),
    // Legacy projection kept for compatibility while group config converges on `config`.
    agentPolicy: jsonb("agent_policy").notNull(), // { auto_trigger, multi_agent, ... }
    createdBy: text("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => ({
    orgIdIdx: index("groups_org_id_idx").on(table.orgId),
  })
);

export const groupsRelations = relations(groups, ({ many }) => ({
  members: many(groupMembers),
  agents: many(groupAgents),
}));

export const groupMembers = pgTable(
  "group_members",
  {
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role").notNull(), // 'owner', 'member'
    addedBy: text("added_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.groupId, table.userId] }),
    userIdIdx: index("group_members_user_id_idx").on(table.userId),
  })
);

export const groupMembersRelations = relations(groupMembers, ({ one }) => ({
  group: one(groups, {
    fields: [groupMembers.groupId],
    references: [groups.id],
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
    providerId: text("provider_id"),
    name: text("name").notNull(),
    description: text("description"),
    config: jsonb("config").notNull(), // { system_prompt, model, tools... }
    visibility: text("visibility").notNull(), // 'public', 'private'
    createdBy: text("created_by").references(() => users.id),
    parentAgentId: text("parent_agent_id"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    orgIdIdx: index("agents_org_id_idx").on(table.orgId),
  })
);

export const groupAgents = pgTable(
  "group_agents",
  {
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id),
    addedBy: text("added_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.groupId, table.agentId] }),
  })
);

export const groupAgentsRelations = relations(groupAgents, ({ one }) => ({
  group: one(groups, {
    fields: [groupAgents.groupId],
    references: [groups.id],
  }),
  agent: one(agents, {
    fields: [groupAgents.agentId],
    references: [agents.id],
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
    // Canonical MCP runtime config for this workspace record.
    config: jsonb("config").notNull(),
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
  })
);

export const mcpServerTools = pgTable(
  "mcp_server_tools",
  {
    serverId: text("server_id")
      .notNull()
      .references(() => mcpServers.id),
    toolId: text("tool_id").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    inputSchema: jsonb("input_schema"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.serverId, table.toolId] }),
    serverIdIdx: index("mcp_server_tools_server_id_idx").on(table.serverId),
  })
);

export const mcpServerToolsRelations = relations(mcpServerTools, ({ one }) => ({
  server: one(mcpServers, {
    fields: [mcpServerTools.serverId],
    references: [mcpServers.id],
  }),
}));

export const mcpServersRelations = relations(mcpServers, ({ one, many }) => ({
  org: one(orgs, {
    fields: [mcpServers.orgId],
    references: [orgs.id],
  }),
  createdBy: one(users, {
    fields: [mcpServers.createdBy],
    references: [users.id],
  }),
  tools: many(mcpServerTools),
}));

// --- Runtime Routing ---

export const groupRuntime = pgTable("group_runtime", {
  groupId: text("group_id")
    .primaryKey()
    .references(() => groups.id),
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
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id),
    status: text("status").notNull(),
    baseUrl: text("base_url").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    groupIdIdx: index("agent_runtimes_group_id_idx").on(table.groupId),
  })
);

export const groupAgentRuntimes = pgTable(
  "group_agent_runtimes",
  {
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id),
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
      columns: [table.groupId, table.agentId, table.runtimeId],
    }),
  })
);

// --- Lifecycle & Archive ---

export const groupArchives = pgTable(
  "group_archives",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id),
    snapshotId: text("snapshot_id").notNull(),
    r2Path: text("r2_path").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    groupIdIdx: index("group_archives_group_id_idx").on(table.groupId),
  })
);

export const groupSnapshots = pgTable(
  "group_snapshots",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id),
    r2Path: text("r2_path").notNull(),
    sizeBytes: integer("size_bytes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    groupIdIdx: index("group_snapshots_group_id_idx").on(table.groupId),
  })
);

export const groupTasks = pgTable(
  "group_tasks",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id),
    taskType: text("task_type").notNull(),
    status: text("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    groupIdIdx: index("group_tasks_group_id_idx").on(table.groupId),
  })
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
  })
);

export const providerCatalog = pgTable(
  "provider_catalog",
  {
    id: text("provider_id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => orgs.id),
    name: text("name").notNull(),
    providerType: text("provider_type").notNull(), // e.g. 'cloudflare_ai_gateway'
    kind: text("kind").notNull(), // e.g. 'openai', 'gemini'
    modelId: text("model_id").notNull(),
    secretRef: text("secret_ref")
      .notNull()
      .references(() => secrets.id),
    gatewayAccountId: text("gateway_account_id").notNull(),
    gatewayId: text("gateway_id").notNull(),
    // Canonical provider runtime config for this workspace record.
    config: jsonb("config").notNull(),
    createdBy: text("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    orgIdIdx: index("provider_catalog_org_id_idx").on(table.orgId),
    providerTypeIdx: index("provider_catalog_provider_type_idx").on(
      table.providerType
    ),
  })
);

export const groupSecrets = pgTable(
  "group_secrets",
  {
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id),
    secretId: text("secret_id")
      .notNull()
      .references(() => secrets.id),
    grantedBy: text("granted_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.groupId, table.secretId] }),
  })
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
  })
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
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    orgIdIdx: index("audit_log_org_id_idx").on(table.orgId),
    actorUserIdIdx: index("audit_log_actor_user_id_idx").on(table.actorUserId),
  })
);
