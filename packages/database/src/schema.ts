import { pgTable, text, timestamptz, boolean, jsonb, integer } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// --- Organizations ---

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
  role: text("role").notNull(), // 'owner', 'member', 'admin'
  createdAt: timestamptz("created_at").notNull()
});

// --- Groups (Persistent Chat Rooms) ---

export const groups = pgTable("groups", {
  groupId: text("group_id").primaryKey(),
  orgId: text("org_id").notNull(),
  title: text("title").notNull(),
  status: text("status").notNull(), // 'active', 'idle', 'archived'
  isPrivate: boolean("is_private").notNull().default(false),
  agentPolicy: jsonb("agent_policy").notNull(), // { auto_trigger, multi_agent, ... }
  createdBy: text("created_by"),
  createdAt: timestamptz("created_at").notNull(),
  updatedAt: timestamptz("updated_at").notNull(),
  lastActiveAt: timestamptz("last_active_at"),
  archivedAt: timestamptz("archived_at")
});

export const groupsRelations = relations(groups, ({ many }) => ({
  members: many(groupMembers),
  agents: many(groupAgents)
}));

export const groupMembers = pgTable("group_members", {
  groupId: text("group_id").notNull(),
  userId: text("user_id").notNull(),
  role: text("role").notNull(), // 'owner', 'member'
  addedBy: text("added_by"),
  createdAt: timestamptz("created_at").notNull()
});

export const groupMembersRelations = relations(groupMembers, ({ one }) => ({
  group: one(groups, {
    fields: [groupMembers.groupId],
    references: [groups.groupId]
  })
}));

// --- Agents ---

export const agents = pgTable("agents", {
  agentId: text("agent_id").primaryKey(),
  orgId: text("org_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  config: jsonb("config").notNull(), // { system_prompt, model, tools... }
  visibility: text("visibility").notNull(), // 'public', 'private'
  createdBy: text("created_by"),
  parentAgentId: text("parent_agent_id"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamptz("created_at").notNull(),
  updatedAt: timestamptz("updated_at").notNull()
});

export const groupAgents = pgTable("group_agents", {
  groupId: text("group_id").notNull(),
  agentId: text("agent_id").notNull(),
  addedBy: text("added_by"),
  createdAt: timestamptz("created_at").notNull()
});

export const groupAgentsRelations = relations(groupAgents, ({ one }) => ({
  group: one(groups, {
    fields: [groupAgents.groupId],
    references: [groups.groupId]
  }),
  agent: one(agents, {
    fields: [groupAgents.agentId],
    references: [agents.agentId]
  })
}));

// --- Runtime Routing ---

export const groupRuntime = pgTable("group_runtime", {
  groupId: text("group_id").primaryKey(),
  groupControllerId: text("group_controller_id").notNull(), // Durable Object ID string
  status: text("status").notNull(), // 'active', 'idle'
  lastActiveAt: timestamptz("last_active_at"),
  idleAt: timestamptz("idle_at"),
  region: text("region"),
  publicKey: text("public_key"), // Session Public Key for Chain of Trust verification
  updatedAt: timestamptz("updated_at").notNull()
});

export const agentRuntimes = pgTable("agent_runtimes", {
  runtimeId: text("runtime_id").primaryKey(),
  groupId: text("group_id").notNull(),
  agentId: text("agent_id").notNull(),
  status: text("status").notNull(),
  baseUrl: text("base_url").notNull(),
  createdAt: timestamptz("created_at").notNull(),
  updatedAt: timestamptz("updated_at").notNull()
});

export const groupAgentRuntimes = pgTable("group_agent_runtimes", {
  groupId: text("group_id").notNull(),
  agentId: text("agent_id").notNull(),
  runtimeId: text("runtime_id").notNull(),
  createdAt: timestamptz("created_at").notNull()
});

// --- Lifecycle & Archive ---

export const groupArchives = pgTable("group_archives", {
  archiveId: text("archive_id").primaryKey(),
  groupId: text("group_id").notNull(),
  snapshotId: text("snapshot_id").notNull(),
  r2Path: text("r2_path").notNull(),
  createdAt: timestamptz("created_at").notNull()
});

export const groupSnapshots = pgTable("group_snapshots", {
  snapshotId: text("snapshot_id").primaryKey(),
  groupId: text("group_id").notNull(),
  r2Path: text("r2_path").notNull(),
  sizeBytes: integer("size_bytes"), 
  createdAt: timestamptz("created_at").notNull()
});

export const groupTasks = pgTable("group_tasks", {
  taskId: text("task_id").primaryKey(),
  groupId: text("group_id").notNull(),
  taskType: text("task_type").notNull(),
  status: text("status").notNull(),
  createdAt: timestamptz("created_at").notNull(),
  updatedAt: timestamptz("updated_at").notNull()
});

// --- Secrets ---

export const secrets = pgTable("secrets", {
  secretId: text("secret_id").primaryKey(),
  orgId: text("org_id").notNull(),
  name: text("name").notNull(),
  namespace: text("namespace").notNull(), // 'agent' 
  ciphertext: text("ciphertext").notNull(),
  createdBy: text("created_by"),
  createdAt: timestamptz("created_at").notNull(),
  rotatedAt: timestamptz("rotated_at")
});

export const groupSecrets = pgTable("group_secrets", {
  groupId: text("group_id").notNull(),
  secretId: text("secret_id").notNull(),
  grantedBy: text("granted_by"),
  createdAt: timestamptz("created_at").notNull()
});

// --- Billing ---

export const orgUsage = pgTable("org_usage", {
  orgId: text("org_id").notNull(),
  periodStart: timestamptz("period_start").notNull(), 
  periodEnd: timestamptz("period_end").notNull(),
  concurrentGroupsPeak: integer("concurrent_groups_peak"),
});

export const orgLimits = pgTable("org_limits", {
  orgId: text("org_id").primaryKey(),
  maxStorageGb: integer("max_storage_gb"), 
  maxEgressGb: integer("max_egress_gb")
});

export const subscriptions = pgTable("subscriptions", {
  orgId: text("org_id").primaryKey(),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  status: text("status"),
  currentPeriodEnd: timestamptz("current_period_end"),
  createdAt: timestamptz("created_at").notNull(),
  updatedAt: timestamptz("updated_at").notNull()
});

// --- Audit ---

export const auditLog = pgTable("audit_log", {
  auditId: text("audit_id").primaryKey(),
  orgId: text("org_id"),
  actorUserId: text("actor_user_id"),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: text("target_id"),
  metadata: jsonb("metadata"),
  createdAt: timestamptz("created_at").notNull()
});
