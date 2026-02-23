import { desc, eq } from "drizzle-orm";
import { db } from "../client";
import { agents } from "../schema";

export interface CreateAgentParams {
  config: any;
  createdBy: string;
  description?: string;
  name: string;
  orgId: string;
}

export async function createAgent(params: CreateAgentParams) {
  const now = new Date();
  const id = `agent_${crypto.randomUUID()}`;

  await db.insert(agents).values({
    id,
    orgId: params.orgId,
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
