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
    opts.req as NextRequest
  );

  // Resolve internal IDs if available
  const userId = clerkUserId ? await getInternalUserId(clerkUserId) : null;
  const orgId = clerkOrgId ? await getInternalOrgId(clerkOrgId) : null;
  const role = userId && orgId ? await getUserOrgRole(userId, orgId) : null;
  const isAdmin = userId ? await isSuperAdmin(userId) : false;

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
