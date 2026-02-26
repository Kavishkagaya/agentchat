import { and, desc, eq } from "drizzle-orm";
import { db } from "../client";
import { agents } from "../schema";

export interface CreateAgentParams {
  config: any;
  createdBy: string;
  description?: string;
  name: string;
  orgId: string;
  providerId?: string | null;
}

export async function createAgent(params: CreateAgentParams) {
  const now = new Date();
  const id = `agent_${crypto.randomUUID()}`;

  await db.insert(agents).values({
    id,
    orgId: params.orgId,
    providerId: params.providerId ?? null,
    name: params.name,
    description: params.description,
    config: params.config,
    visibility: "private",
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  });

  return { agentId: id, createdAt: now };
}

export async function getAgents(orgId: string) {
  return await db.query.agents.findMany({
    where: eq(agents.orgId, orgId),
    orderBy: [desc(agents.updatedAt)],
  });
}

export async function getPublicAgents() {
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

export async function copyPublicAgent(params: {
  orgId: string;
  agentId: string;
  createdBy: string;
}) {
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
