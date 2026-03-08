import { relations } from "drizzle-orm/relations";
import { orgs, auditLog, users, agents, agentRuntimes, configs, groupRuntime, groupSnapshots, orgMembers, groupTasks, orgLimits, groupArchives, orgUsage, secrets, subscriptions, mcpServers, modelCatalog, groupAgents, groupSecrets, groupAgentRuntimes, groupMembers } from "./schema";

export const auditLogRelations = relations(auditLog, ({one}) => ({
	org: one(orgs, {
		fields: [auditLog.orgId],
		references: [orgs.id]
	}),
	user: one(users, {
		fields: [auditLog.actorUserId],
		references: [users.id]
	}),
}));

export const orgsRelations = relations(orgs, ({many}) => ({
	auditLogs: many(auditLog),
	agents: many(agents),
	orgMembers: many(orgMembers),
	orgLimits: many(orgLimits),
	orgUsages: many(orgUsage),
	configs: many(configs),
	secrets: many(secrets),
	subscriptions: many(subscriptions),
	mcpServers: many(mcpServers),
	modelCatalogs: many(modelCatalog),
}));

export const usersRelations = relations(users, ({many}) => ({
	auditLogs: many(auditLog),
	agents: many(agents),
	orgMembers: many(orgMembers),
	configs: many(configs),
	secrets: many(secrets),
	mcpServers: many(mcpServers),
	modelCatalogs: many(modelCatalog),
	groupAgents: many(groupAgents),
	groupSecrets: many(groupSecrets),
	groupMembers_userId: many(groupMembers, {
		relationName: "groupMembers_userId_users_id"
	}),
	groupMembers_addedBy: many(groupMembers, {
		relationName: "groupMembers_addedBy_users_id"
	}),
}));

export const agentsRelations = relations(agents, ({one, many}) => ({
	org: one(orgs, {
		fields: [agents.orgId],
		references: [orgs.id]
	}),
	user: one(users, {
		fields: [agents.createdBy],
		references: [users.id]
	}),
	agentRuntimes: many(agentRuntimes),
	groupAgents: many(groupAgents),
	groupAgentRuntimes: many(groupAgentRuntimes),
}));

export const agentRuntimesRelations = relations(agentRuntimes, ({one, many}) => ({
	agent: one(agents, {
		fields: [agentRuntimes.agentId],
		references: [agents.id]
	}),
	config: one(configs, {
		fields: [agentRuntimes.configId],
		references: [configs.id]
	}),
	groupAgentRuntimes: many(groupAgentRuntimes),
}));

export const configsRelations = relations(configs, ({one, many}) => ({
	agentRuntimes: many(agentRuntimes),
	groupRuntimes: many(groupRuntime),
	groupSnapshots: many(groupSnapshots),
	groupTasks: many(groupTasks),
	groupArchives: many(groupArchives),
	org: one(orgs, {
		fields: [configs.orgId],
		references: [orgs.id]
	}),
	user: one(users, {
		fields: [configs.createdBy],
		references: [users.id]
	}),
	groupAgents: many(groupAgents),
	groupSecrets: many(groupSecrets),
	groupAgentRuntimes: many(groupAgentRuntimes),
	groupMembers: many(groupMembers),
}));

export const groupRuntimeRelations = relations(groupRuntime, ({one}) => ({
	config: one(configs, {
		fields: [groupRuntime.configId],
		references: [configs.id]
	}),
}));

export const groupSnapshotsRelations = relations(groupSnapshots, ({one}) => ({
	config: one(configs, {
		fields: [groupSnapshots.configId],
		references: [configs.id]
	}),
}));

export const orgMembersRelations = relations(orgMembers, ({one}) => ({
	org: one(orgs, {
		fields: [orgMembers.orgId],
		references: [orgs.id]
	}),
	user: one(users, {
		fields: [orgMembers.userId],
		references: [users.id]
	}),
}));

export const groupTasksRelations = relations(groupTasks, ({one}) => ({
	config: one(configs, {
		fields: [groupTasks.configId],
		references: [configs.id]
	}),
}));

export const orgLimitsRelations = relations(orgLimits, ({one}) => ({
	org: one(orgs, {
		fields: [orgLimits.orgId],
		references: [orgs.id]
	}),
}));

export const groupArchivesRelations = relations(groupArchives, ({one}) => ({
	config: one(configs, {
		fields: [groupArchives.configId],
		references: [configs.id]
	}),
}));

export const orgUsageRelations = relations(orgUsage, ({one}) => ({
	org: one(orgs, {
		fields: [orgUsage.orgId],
		references: [orgs.id]
	}),
}));

export const secretsRelations = relations(secrets, ({one, many}) => ({
	org: one(orgs, {
		fields: [secrets.orgId],
		references: [orgs.id]
	}),
	user: one(users, {
		fields: [secrets.createdBy],
		references: [users.id]
	}),
	modelCatalogs: many(modelCatalog),
	groupSecrets: many(groupSecrets),
}));

export const subscriptionsRelations = relations(subscriptions, ({one}) => ({
	org: one(orgs, {
		fields: [subscriptions.orgId],
		references: [orgs.id]
	}),
}));

export const mcpServersRelations = relations(mcpServers, ({one}) => ({
	org: one(orgs, {
		fields: [mcpServers.orgId],
		references: [orgs.id]
	}),
	user: one(users, {
		fields: [mcpServers.createdBy],
		references: [users.id]
	}),
}));

export const modelCatalogRelations = relations(modelCatalog, ({one}) => ({
	org: one(orgs, {
		fields: [modelCatalog.orgId],
		references: [orgs.id]
	}),
	secret: one(secrets, {
		fields: [modelCatalog.secretRef],
		references: [secrets.secretId]
	}),
	user: one(users, {
		fields: [modelCatalog.createdBy],
		references: [users.id]
	}),
}));

export const groupAgentsRelations = relations(groupAgents, ({one}) => ({
	agent: one(agents, {
		fields: [groupAgents.agentId],
		references: [agents.id]
	}),
	user: one(users, {
		fields: [groupAgents.addedBy],
		references: [users.id]
	}),
	config: one(configs, {
		fields: [groupAgents.configId],
		references: [configs.id]
	}),
}));

export const groupSecretsRelations = relations(groupSecrets, ({one}) => ({
	user: one(users, {
		fields: [groupSecrets.grantedBy],
		references: [users.id]
	}),
	secret: one(secrets, {
		fields: [groupSecrets.secretId],
		references: [secrets.secretId]
	}),
	config: one(configs, {
		fields: [groupSecrets.configId],
		references: [configs.id]
	}),
}));

export const groupAgentRuntimesRelations = relations(groupAgentRuntimes, ({one}) => ({
	agent: one(agents, {
		fields: [groupAgentRuntimes.agentId],
		references: [agents.id]
	}),
	agentRuntime: one(agentRuntimes, {
		fields: [groupAgentRuntimes.runtimeId],
		references: [agentRuntimes.id]
	}),
	config: one(configs, {
		fields: [groupAgentRuntimes.configId],
		references: [configs.id]
	}),
}));

export const groupMembersRelations = relations(groupMembers, ({one}) => ({
	user_userId: one(users, {
		fields: [groupMembers.userId],
		references: [users.id],
		relationName: "groupMembers_userId_users_id"
	}),
	user_addedBy: one(users, {
		fields: [groupMembers.addedBy],
		references: [users.id],
		relationName: "groupMembers_addedBy_users_id"
	}),
	config: one(configs, {
		fields: [groupMembers.configId],
		references: [configs.id]
	}),
}));