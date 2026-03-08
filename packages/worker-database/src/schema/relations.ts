import { relations } from "drizzle-orm/relations";
import { orgs, auditLog, users, agents, groups, agentRuntimes, groupRuntime, groupSnapshots, orgMembers, groupTasks, orgLimits, groupArchives, orgUsage, secrets, subscriptions, mcpServers, modelCatalog, groupAgents, groupSecrets, groupAgentRuntimes, groupMembers } from "./schema";

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
	groups: many(groups),
	orgMembers: many(orgMembers),
	orgLimits: many(orgLimits),
	orgUsages: many(orgUsage),
	secrets: many(secrets),
	subscriptions: many(subscriptions),
	mcpServers: many(mcpServers),
	modelCatalogs: many(modelCatalog),
}));

export const usersRelations = relations(users, ({many}) => ({
	auditLogs: many(auditLog),
	agents: many(agents),
	groups: many(groups),
	orgMembers: many(orgMembers),
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
	group: one(groups, {
		fields: [agentRuntimes.groupId],
		references: [groups.id]
	}),
	agent: one(agents, {
		fields: [agentRuntimes.agentId],
		references: [agents.id]
	}),
	groupAgentRuntimes: many(groupAgentRuntimes),
}));

export const groupsRelations = relations(groups, ({one, many}) => ({
	agentRuntimes: many(agentRuntimes),
	groupRuntimes: many(groupRuntime),
	org: one(orgs, {
		fields: [groups.orgId],
		references: [orgs.id]
	}),
	user: one(users, {
		fields: [groups.createdBy],
		references: [users.id]
	}),
	groupSnapshots: many(groupSnapshots),
	groupTasks: many(groupTasks),
	groupArchives: many(groupArchives),
	groupAgents: many(groupAgents),
	groupSecrets: many(groupSecrets),
	groupAgentRuntimes: many(groupAgentRuntimes),
	groupMembers: many(groupMembers),
}));

export const groupRuntimeRelations = relations(groupRuntime, ({one}) => ({
	group: one(groups, {
		fields: [groupRuntime.groupId],
		references: [groups.id]
	}),
}));

export const groupSnapshotsRelations = relations(groupSnapshots, ({one}) => ({
	group: one(groups, {
		fields: [groupSnapshots.groupId],
		references: [groups.id]
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
	group: one(groups, {
		fields: [groupTasks.groupId],
		references: [groups.id]
	}),
}));

export const orgLimitsRelations = relations(orgLimits, ({one}) => ({
	org: one(orgs, {
		fields: [orgLimits.orgId],
		references: [orgs.id]
	}),
}));

export const groupArchivesRelations = relations(groupArchives, ({one}) => ({
	group: one(groups, {
		fields: [groupArchives.groupId],
		references: [groups.id]
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
	group: one(groups, {
		fields: [groupAgents.groupId],
		references: [groups.id]
	}),
	agent: one(agents, {
		fields: [groupAgents.agentId],
		references: [agents.id]
	}),
	user: one(users, {
		fields: [groupAgents.addedBy],
		references: [users.id]
	}),
}));

export const groupSecretsRelations = relations(groupSecrets, ({one}) => ({
	group: one(groups, {
		fields: [groupSecrets.groupId],
		references: [groups.id]
	}),
	user: one(users, {
		fields: [groupSecrets.grantedBy],
		references: [users.id]
	}),
	secret: one(secrets, {
		fields: [groupSecrets.secretId],
		references: [secrets.secretId]
	}),
}));

export const groupAgentRuntimesRelations = relations(groupAgentRuntimes, ({one}) => ({
	group: one(groups, {
		fields: [groupAgentRuntimes.groupId],
		references: [groups.id]
	}),
	agent: one(agents, {
		fields: [groupAgentRuntimes.agentId],
		references: [agents.id]
	}),
	agentRuntime: one(agentRuntimes, {
		fields: [groupAgentRuntimes.runtimeId],
		references: [agentRuntimes.id]
	}),
}));

export const groupMembersRelations = relations(groupMembers, ({one}) => ({
	group: one(groups, {
		fields: [groupMembers.groupId],
		references: [groups.id]
	}),
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
}));