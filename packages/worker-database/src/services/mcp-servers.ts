import { and, eq } from "drizzle-orm";
import { getDb } from "../client";
import { mcpServers } from "../schema";

export async function getMcpServer(params: {
  orgId: string;
  serverId: string;
}) {
  const db = getDb();
  return await db.query.mcpServers.findFirst({
    where: and(
      eq(mcpServers.id, params.serverId),
      eq(mcpServers.orgId, params.orgId),
    ),
  });
}
