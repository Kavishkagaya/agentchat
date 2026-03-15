import { relations } from "drizzle-orm/relations";
import { orgs, auditLog, users, agents, agentRuntimes, configs, orgMembers, chatArchives, orgLimits, orgUsage, chatRuntime, chatSnapshots, secrets, subscriptions, mcpServers, modelCatalog, chatAgentRuntimes, chatAgents, chatMembers } from "./schema";

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
	chatAgents: many(chatAgents),
	chatMembers_userId: many(chatMembers, {
		relationName: "chatMembers_userId_users_id"
	}),
	chatMembers_addedBy: many(chatMembers, {
		relationName: "chatMembers_addedBy_users_id"
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
	chatAgentRuntimes: many(chatAgentRuntimes),
	chatAgents: many(chatAgents),
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
	chatAgentRuntimes: many(chatAgentRuntimes),
}));

export const configsRelations = relations(configs, ({one, many}) => ({
	agentRuntimes: many(agentRuntimes),
	chatArchives: many(chatArchives),
	chatRuntimes: many(chatRuntime),
	org: one(orgs, {
		fields: [configs.orgId],
		references: [orgs.id]
	}),
	user: one(users, {
		fields: [configs.createdBy],
		references: [users.id]
	}),
	chatSnapshots: many(chatSnapshots),
	chatAgentRuntimes: many(chatAgentRuntimes),
	chatAgents: many(chatAgents),
	chatMembers: many(chatMembers),
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

export const chatArchivesRelations = relations(chatArchives, ({one}) => ({
	config: one(configs, {
		fields: [chatArchives.configId],
		references: [configs.id]
	}),
}));

export const orgLimitsRelations = relations(orgLimits, ({one}) => ({
	org: one(orgs, {
		fields: [orgLimits.orgId],
		references: [orgs.id]
	}),
}));

export const orgUsageRelations = relations(orgUsage, ({one}) => ({
	org: one(orgs, {
		fields: [orgUsage.orgId],
		references: [orgs.id]
	}),
}));

export const chatRuntimeRelations = relations(chatRuntime, ({one}) => ({
	config: one(configs, {
		fields: [chatRuntime.configId],
		references: [configs.id]
	}),
}));

export const chatSnapshotsRelations = relations(chatSnapshots, ({one}) => ({
	config: one(configs, {
		fields: [chatSnapshots.configId],
		references: [configs.id]
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

export const chatAgentRuntimesRelations = relations(chatAgentRuntimes, ({one}) => ({
	config: one(configs, {
		fields: [chatAgentRuntimes.configId],
		references: [configs.id]
	}),
	agent: one(agents, {
		fields: [chatAgentRuntimes.agentId],
		references: [agents.id]
	}),
	agentRuntime: one(agentRuntimes, {
		fields: [chatAgentRuntimes.runtimeId],
		references: [agentRuntimes.id]
	}),
}));

export const chatAgentsRelations = relations(chatAgents, ({one}) => ({
	config: one(configs, {
		fields: [chatAgents.configId],
		references: [configs.id]
	}),
	agent: one(agents, {
		fields: [chatAgents.agentId],
		references: [agents.id]
	}),
	user: one(users, {
		fields: [chatAgents.addedBy],
		references: [users.id]
	}),
}));

export const chatMembersRelations = relations(chatMembers, ({one}) => ({
	config: one(configs, {
		fields: [chatMembers.configId],
		references: [configs.id]
	}),
	user_userId: one(users, {
		fields: [chatMembers.userId],
		references: [users.id],
		relationName: "chatMembers_userId_users_id"
	}),
	user_addedBy: one(users, {
		fields: [chatMembers.addedBy],
		references: [users.id],
		relationName: "chatMembers_addedBy_users_id"
	}),
}));