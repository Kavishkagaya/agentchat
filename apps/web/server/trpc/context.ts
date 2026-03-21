import {
  getDb,
  getInternalOrgId,
  getInternalUserId,
  getUserOrgRole,
  isSuperAdmin,
} from "@axon/database";
import { getAuth } from "@clerk/nextjs/server";
import type { inferAsyncReturnType } from "@trpc/server";
import type { NextRequest } from "next/server";

import { getOrchestratorClient } from "../workers/orchestrator";

export async function createContext(opts: { req: Request | NextRequest }) {
  const { userId: clerkUserId, orgId: clerkOrgId } = getAuth(
    opts.req as NextRequest,
  );

  // Resolve internal IDs if available (parallelize independent lookups)
  const [userId, orgId] = await Promise.all([
    clerkUserId ? getInternalUserId(clerkUserId) : Promise.resolve(null),
    clerkOrgId ? getInternalOrgId(clerkOrgId) : Promise.resolve(null),
  ]);
  const [role, isAdmin] = await Promise.all([
    userId && orgId ? getUserOrgRole(userId, orgId) : Promise.resolve(null),
    userId ? isSuperAdmin(userId) : Promise.resolve(false),
  ]);

  return {
    db: getDb(),
    orchestrator: getOrchestratorClient(),
    auth: {
      clerkUserId,
      clerkOrgId,
      userId, // internal id
      orgId, // internal id
      role, // user's role in the org (e.g., "admin", "member")
      isSuperAdmin: isAdmin, // boolean indicating if the user is a super admin
    },
  };
}

export type Context = inferAsyncReturnType<typeof createContext>;
