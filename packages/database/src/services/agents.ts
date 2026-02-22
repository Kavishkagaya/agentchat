import { eq, desc } from "drizzle-orm";
import { agents } from "../schema";
import type { Db } from "../types";

export interface CreateAgentParams {
  orgId: string;
  name: string;
  description?: string;
  config: any;
  createdBy: string;
}

export async function createAgent(db: Db, params: CreateAgentParams) {
  const now = new Date();
  const agentId = `agent_${crypto.randomUUID()}`;
  
  await db.insert(agents).values({
    agentId,
    orgId: params.orgId,
    name: params.name,
    description: params.description,
    config: params.config,
    visibility: "private",
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now
  });

  return { agentId, createdAt: now };
}

export async function getAgents(db: Db, orgId: string) {
  return await db.query.agents.findMany({
    where: eq(agents.orgId, orgId),
    orderBy: [desc(agents.updatedAt)]
  });
}
