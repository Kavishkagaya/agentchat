import { db, getInternalOrgId, getInternalUserId } from "@axon/database";
import { getAuth } from "@clerk/nextjs/server";
import type { inferAsyncReturnType } from "@trpc/server";
import type { NextRequest } from "next/server";

import { getOrchestratorClient } from "../workers/orchestrator";

export async function createContext(opts: { req: Request | NextRequest }) {
  const { userId: clerkUserId, orgId: clerkOrgId } = getAuth(
    opts.req as NextRequest
  );

  // Resolve internal IDs if available
  const userId = clerkUserId ? await getInternalUserId(clerkUserId) : null;
  const orgId = clerkOrgId ? await getInternalOrgId(clerkOrgId) : null;

  return {
    db,
    orchestrator: getOrchestratorClient(),
    auth: {
      clerkUserId,
      clerkOrgId,
      userId, // internal id
      orgId, // internal id
    },
  };
}

export type Context = inferAsyncReturnType<typeof createContext>;
