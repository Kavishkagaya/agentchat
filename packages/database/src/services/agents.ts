import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../client";
import { agents, modelCatalog } from "../schema";

export interface CreateAgentParams {
  config: any;
  createdBy: string;
  description?: string;
  modelId?: string | null;
  name: string;
  orgId: string;
}

export async function createAgent(params: CreateAgentParams) {
  const db = getDb();
  const now = new Date();
  const id = `agent_${crypto.randomUUID()}`;

  await db.insert(agents).values({
    id,
    modelId: params.modelId ?? null,
    name: params.name,
    orgId: params.orgId,
    description: params.description,
    config: params.config,
    visibility: "private",
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  });

  return { agentId: id, createdAt: now };
}

export async function getAgent(agentId: string, orgId: string) {
  const db = getDb();
  const agent = await db.query.agents.findFirst({
    where: and(eq(agents.id, agentId), eq(agents.orgId, orgId)),
  });

  if (!agent) {
    return null;
  }

  let model: typeof modelCatalog.$inferSelect | undefined;
  if (agent.modelId) {
    model = await db.query.modelCatalog.findFirst({
      where: eq(modelCatalog.id, agent.modelId),
    });
  }

  return {
    ...agent,
    model: model ?? null,
  };
}

export async function getAgents(orgId: string) {
  const db = getDb();
  const agentList = await db.query.agents.findMany({
    where: eq(agents.orgId, orgId),
    orderBy: [desc(agents.updatedAt)],
  });

  const agentsWithModels = await Promise.all(
    agentList.map(async (agent) => {
      let model: typeof modelCatalog.$inferSelect | undefined;
      if (agent.modelId) {
        model = await db.query.modelCatalog.findFirst({
          where: eq(modelCatalog.id, agent.modelId),
        });
      }
      return {
        ...agent,
        model: model ?? null,
      };
    })
  );

  return agentsWithModels;
}

export async function getPublicAgents() {
  const db = getDb();
  return await db.query.agents.findMany({
    where: eq(agents.visibility, "public"),
    orderBy: [desc(agents.updatedAt)],
  });
}

function stripOrgSpecificConfig(config: Record<string, unknown>) {
  const cleaned = { ...config };
  delete cleaned.secretRef;
  delete cleaned.apiKey;
  delete cleaned.token;
  delete cleaned.orgId;
  delete cleaned.org_id;
  delete cleaned.secrets;
  delete cleaned.credentials;
  return cleaned;
}

export async function publishAgent(params: {
  orgId: string;
  agentId: string;
  createdBy: string;
}) {
  const db = getDb();
  const agent = await db.query.agents.findFirst({
    where: and(eq(agents.id, params.agentId), eq(agents.orgId, params.orgId)),
  });

  if (!agent) {
    throw new Error("Agent not found");
  }

  const now = new Date();
  const publicId = `agent_${crypto.randomUUID()}`;

  await db.insert(agents).values({
    id: publicId,
    orgId: params.orgId,
    name: agent.name,
    description: agent.description,
    config: stripOrgSpecificConfig(agent.config as Record<string, unknown>),
    visibility: "public",
    createdBy: agent.createdBy ?? params.createdBy,
    parentAgentId: agent.id,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  });

  return { publicAgentId: publicId, createdAt: now };
}

export interface UpdateAgentParams {
  agentId: string;
  config?: Record<string, unknown>;
  description?: string;
  modelId?: string | null;
  name?: string;
  orgId: string;
}

export async function updateAgent(params: UpdateAgentParams) {
  const db = getDb();
  const now = new Date();
  const updates: Record<string, unknown> = { updatedAt: now };

  if (params.name !== undefined) {
    updates.name = params.name;
  }
  if (params.description !== undefined) {
    updates.description = params.description;
  }
  if (params.config !== undefined) {
    updates.config = params.config;
  }
  if (params.modelId !== undefined) {
    updates.modelId = params.modelId;
  }

  await db
    .update(agents)
    .set(updates)
    .where(and(eq(agents.id, params.agentId), eq(agents.orgId, params.orgId)));

  return { agentId: params.agentId, updatedAt: now };
}

export async function copyPublicAgent(params: {
  orgId: string;
  agentId: string;
  createdBy: string;
}) {
  const db = getDb();
  const agent = await db.query.agents.findFirst({
    where: and(eq(agents.id, params.agentId), eq(agents.visibility, "public")),
  });

  if (!agent) {
    throw new Error("Public agent not found");
  }

  const now = new Date();
  const id = `agent_${crypto.randomUUID()}`;

  await db.insert(agents).values({
    id,
    orgId: params.orgId,
    name: agent.name,
    description: agent.description,
    config: agent.config,
    visibility: "private",
    createdBy: params.createdBy,
    parentAgentId: agent.id,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  });

  return { agentId: id, createdAt: now };
}
