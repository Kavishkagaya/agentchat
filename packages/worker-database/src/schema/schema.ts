import { pgTable, index, foreignKey, text, jsonb, timestamp, boolean, integer, uniqueIndex, primaryKey } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const auditLog = pgTable("audit_log", {
	id: text().primaryKey().notNull(),
	orgId: text("org_id"),
	actorUserId: text("actor_user_id"),
	action: text().notNull(),
	targetType: text("target_type"),
	targetId: text("target_id"),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	index("audit_log_actor_user_id_idx").using("btree", table.actorUserId.asc().nullsLast().op("text_ops")),
	index("audit_log_org_id_idx").using("btree", table.orgId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.orgId],
			foreignColumns: [orgs.id],
			name: "audit_log_org_id_orgs_id_fk"
		}),
	foreignKey({
			columns: [table.actorUserId],
			foreignColumns: [users.id],
			name: "audit_log_actor_user_id_users_id_fk"
		}),
]);

export const agents = pgTable("agents", {
	id: text().primaryKey().notNull(),
	orgId: text("org_id").notNull(),
	name: text().notNull(),
	description: text(),
	config: jsonb().notNull(),
	visibility: text().notNull(),
	createdBy: text("created_by"),
	parentAgentId: text("parent_agent_id"),
	enabled: boolean().default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
	modelId: text("model_id"),
}, (table) => [
	index("agents_org_id_idx").using("btree", table.orgId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.orgId],
			foreignColumns: [orgs.id],
			name: "agents_org_id_orgs_id_fk"
		}),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "agents_created_by_users_id_fk"
		}),
]);

export const agentRuntimes = pgTable("agent_runtimes", {
	id: text().primaryKey().notNull(),
	configId: text("config_id").notNull(),
	agentId: text("agent_id").notNull(),
	status: text().notNull(),
	baseUrl: text("base_url").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	index("agent_runtimes_group_id_idx").using("btree", table.configId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.agentId],
			foreignColumns: [agents.id],
			name: "agent_runtimes_agent_id_agents_id_fk"
		}),
	foreignKey({
			columns: [table.configId],
			foreignColumns: [configs.id],
			name: "agent_runtimes_config_id_configs_id_fk"
		}),
]);

export const groupRuntime = pgTable("group_runtime", {
	configId: text("config_id").primaryKey().notNull(),
	groupControllerId: text("group_controller_id").notNull(),
	status: text().notNull(),
	lastActiveAt: timestamp("last_active_at", { withTimezone: true, mode: 'string' }),
	idleAt: timestamp("idle_at", { withTimezone: true, mode: 'string' }),
	region: text(),
	publicKey: text("public_key"),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.configId],
			foreignColumns: [configs.id],
			name: "group_runtime_config_id_configs_id_fk"
		}),
]);

export const groupSnapshots = pgTable("group_snapshots", {
	id: text().primaryKey().notNull(),
	configId: text("config_id").notNull(),
	r2Path: text("r2_path").notNull(),
	sizeBytes: integer("size_bytes"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	index("group_snapshots_group_id_idx").using("btree", table.configId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.configId],
			foreignColumns: [configs.id],
			name: "group_snapshots_config_id_configs_id_fk"
		}),
]);

export const orgMembers = pgTable("org_members", {
	orgId: text("org_id").notNull(),
	userId: text("user_id").notNull(),
	role: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	id: text().primaryKey().notNull(),
	clerkOrgId: text("clerk_org_id"),
	clerkUserId: text("clerk_user_id"),
}, (table) => [
	index("org_members_clerk_org_id_idx").using("btree", table.clerkOrgId.asc().nullsLast().op("text_ops")),
	index("org_members_clerk_user_id_idx").using("btree", table.clerkUserId.asc().nullsLast().op("text_ops")),
	uniqueIndex("org_members_org_user_idx").using("btree", table.orgId.asc().nullsLast().op("text_ops"), table.userId.asc().nullsLast().op("text_ops")),
	index("org_members_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.orgId],
			foreignColumns: [orgs.id],
			name: "org_members_org_id_orgs_id_fk"
		}),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "org_members_user_id_users_id_fk"
		}),
]);

export const groupTasks = pgTable("group_tasks", {
	id: text().primaryKey().notNull(),
	configId: text("config_id").notNull(),
	taskType: text("task_type").notNull(),
	status: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	index("group_tasks_group_id_idx").using("btree", table.configId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.configId],
			foreignColumns: [configs.id],
			name: "group_tasks_config_id_configs_id_fk"
		}),
]);

export const orgLimits = pgTable("org_limits", {
	orgId: text("org_id").primaryKey().notNull(),
	maxStorageGb: integer("max_storage_gb"),
	maxEgressGb: integer("max_egress_gb"),
}, (table) => [
	foreignKey({
			columns: [table.orgId],
			foreignColumns: [orgs.id],
			name: "org_limits_org_id_orgs_id_fk"
		}),
]);

export const groupArchives = pgTable("group_archives", {
	id: text().primaryKey().notNull(),
	configId: text("config_id").notNull(),
	snapshotId: text("snapshot_id").notNull(),
	r2Path: text("r2_path").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	index("group_archives_group_id_idx").using("btree", table.configId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.configId],
			foreignColumns: [configs.id],
			name: "group_archives_config_id_configs_id_fk"
		}),
]);

export const orgUsage = pgTable("org_usage", {
	orgId: text("org_id").notNull(),
	periodStart: timestamp("period_start", { withTimezone: true, mode: 'string' }).notNull(),
	periodEnd: timestamp("period_end", { withTimezone: true, mode: 'string' }).notNull(),
	concurrentGroupsPeak: integer("concurrent_groups_peak"),
}, (table) => [
	index("org_usage_org_id_idx").using("btree", table.orgId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.orgId],
			foreignColumns: [orgs.id],
			name: "org_usage_org_id_orgs_id_fk"
		}),
]);

export const configs = pgTable("configs", {
	id: text().primaryKey().notNull(),
	orgId: text("org_id").notNull(),
	title: text().notNull(),
	status: text().notNull(),
	isPrivate: boolean("is_private").default(false).notNull(),
	agentPolicy: jsonb("agent_policy").notNull(),
	createdBy: text("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
	lastActiveAt: timestamp("last_active_at", { withTimezone: true, mode: 'string' }),
	archivedAt: timestamp("archived_at", { withTimezone: true, mode: 'string' }),
	config: jsonb().notNull(),
}, (table) => [
	index("groups_org_id_idx").using("btree", table.orgId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.orgId],
			foreignColumns: [orgs.id],
			name: "configs_org_id_orgs_id_fk"
		}),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "configs_created_by_users_id_fk"
		}),
]);

export const secrets = pgTable("secrets", {
	secretId: text("secret_id").primaryKey().notNull(),
	orgId: text("org_id").notNull(),
	name: text().notNull(),
	namespace: text().notNull(),
	ciphertext: text().notNull(),
	createdBy: text("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	rotatedAt: timestamp("rotated_at", { withTimezone: true, mode: 'string' }),
	version: integer().default(1).notNull(),
}, (table) => [
	index("secrets_org_id_id_idx").using("btree", table.orgId.asc().nullsLast().op("text_ops"), table.secretId.asc().nullsLast().op("text_ops")),
	index("secrets_org_id_idx").using("btree", table.orgId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.orgId],
			foreignColumns: [orgs.id],
			name: "secrets_org_id_orgs_id_fk"
		}),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "secrets_created_by_users_id_fk"
		}),
]);

export const orgs = pgTable("orgs", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	planId: text("plan_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
	clerkId: text("clerk_id").notNull(),
}, (table) => [
	uniqueIndex("orgs_clerk_id_idx").using("btree", table.clerkId.asc().nullsLast().op("text_ops")),
]);

export const subscriptions = pgTable("subscriptions", {
	orgId: text("org_id").primaryKey().notNull(),
	stripeCustomerId: text("stripe_customer_id"),
	stripeSubscriptionId: text("stripe_subscription_id"),
	status: text(),
	currentPeriodEnd: timestamp("current_period_end", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.orgId],
			foreignColumns: [orgs.id],
			name: "subscriptions_org_id_orgs_id_fk"
		}),
]);

export const users = pgTable("users", {
	id: text().primaryKey().notNull(),
	email: text().notNull(),
	firstName: text("first_name"),
	lastName: text("last_name"),
	imageUrl: text("image_url"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
	clerkId: text("clerk_id").notNull(),
	password: text(),
	role: text().default('user').notNull(),
}, (table) => [
	uniqueIndex("users_clerk_id_idx").using("btree", table.clerkId.asc().nullsLast().op("text_ops")),
	uniqueIndex("users_email_idx").using("btree", table.email.asc().nullsLast().op("text_ops")),
]);

export const mcpServers = pgTable("mcp_servers", {
	id: text().primaryKey().notNull(),
	orgId: text("org_id").notNull(),
	name: text().notNull(),
	url: text().notNull(),
	token: text().notNull(),
	secretRef: text("secret_ref"),
	config: jsonb().notNull(),
	status: text().default('pending').notNull(),
	errorMessage: text("error_message"),
	lastValidatedAt: timestamp("last_validated_at", { withTimezone: true, mode: 'string' }),
	createdBy: text("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	index("mcp_servers_org_id_idx").using("btree", table.orgId.asc().nullsLast().op("text_ops")),
	index("mcp_servers_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.orgId],
			foreignColumns: [orgs.id],
			name: "mcp_servers_org_id_orgs_id_fk"
		}),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "mcp_servers_created_by_users_id_fk"
		}),
]);

export const systemConfigs = pgTable("system_configs", {
	key: text().primaryKey().notNull(),
	value: jsonb().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
});

export const modelCatalog = pgTable("model_catalog", {
	id: text().primaryKey().notNull(),
	orgId: text("org_id").notNull(),
	name: text().notNull(),
	modelType: text("model_type").notNull(),
	kind: text().notNull(),
	modelId: text("model_id").notNull(),
	secretRef: text("secret_ref").notNull(),
	gatewayAccountId: text("gateway_account_id").notNull(),
	gatewayId: text("gateway_id").notNull(),
	config: jsonb().notNull(),
	createdBy: text("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	index("model_catalog_model_type_idx").using("btree", table.modelType.asc().nullsLast().op("text_ops")),
	index("model_catalog_org_id_idx").using("btree", table.orgId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.orgId],
			foreignColumns: [orgs.id],
			name: "model_catalog_org_id_orgs_id_fk"
		}),
	foreignKey({
			columns: [table.secretRef],
			foreignColumns: [secrets.secretId],
			name: "model_catalog_secret_ref_secrets_secret_id_fk"
		}),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "model_catalog_created_by_users_id_fk"
		}),
]);

export const groupAgents = pgTable("group_agents", {
	configId: text("config_id").notNull(),
	agentId: text("agent_id").notNull(),
	addedBy: text("added_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.agentId],
			foreignColumns: [agents.id],
			name: "group_agents_agent_id_agents_id_fk"
		}),
	foreignKey({
			columns: [table.addedBy],
			foreignColumns: [users.id],
			name: "group_agents_added_by_users_id_fk"
		}),
	foreignKey({
			columns: [table.configId],
			foreignColumns: [configs.id],
			name: "group_agents_config_id_configs_id_fk"
		}),
	primaryKey({ columns: [table.configId, table.agentId], name: "group_agents_config_id_agent_id_pk"}),
]);

export const groupSecrets = pgTable("group_secrets", {
	configId: text("config_id").notNull(),
	secretId: text("secret_id").notNull(),
	grantedBy: text("granted_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.grantedBy],
			foreignColumns: [users.id],
			name: "group_secrets_granted_by_users_id_fk"
		}),
	foreignKey({
			columns: [table.secretId],
			foreignColumns: [secrets.secretId],
			name: "group_secrets_secret_id_secrets_secret_id_fk"
		}),
	foreignKey({
			columns: [table.configId],
			foreignColumns: [configs.id],
			name: "group_secrets_config_id_configs_id_fk"
		}),
	primaryKey({ columns: [table.configId, table.secretId], name: "group_secrets_config_id_secret_id_pk"}),
]);

export const groupAgentRuntimes = pgTable("group_agent_runtimes", {
	configId: text("config_id").notNull(),
	agentId: text("agent_id").notNull(),
	runtimeId: text("runtime_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.agentId],
			foreignColumns: [agents.id],
			name: "group_agent_runtimes_agent_id_agents_id_fk"
		}),
	foreignKey({
			columns: [table.runtimeId],
			foreignColumns: [agentRuntimes.id],
			name: "group_agent_runtimes_runtime_id_agent_runtimes_id_fk"
		}),
	foreignKey({
			columns: [table.configId],
			foreignColumns: [configs.id],
			name: "group_agent_runtimes_config_id_configs_id_fk"
		}),
	primaryKey({ columns: [table.configId, table.agentId, table.runtimeId], name: "group_agent_runtimes_config_id_agent_id_runtime_id_pk"}),
]);

export const groupMembers = pgTable("group_members", {
	configId: text("config_id").notNull(),
	userId: text("user_id").notNull(),
	role: text().notNull(),
	addedBy: text("added_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	index("group_members_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "group_members_user_id_users_id_fk"
		}),
	foreignKey({
			columns: [table.addedBy],
			foreignColumns: [users.id],
			name: "group_members_added_by_users_id_fk"
		}),
	foreignKey({
			columns: [table.configId],
			foreignColumns: [configs.id],
			name: "group_members_config_id_configs_id_fk"
		}),
	primaryKey({ columns: [table.configId, table.userId], name: "group_members_config_id_user_id_pk"}),
]);
