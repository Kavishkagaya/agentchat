import type { inferAsyncReturnType } from "@trpc/server";
import { getDb } from "../db";
import { getOrchestratorClient } from "../workers/orchestrator";

// Mock Auth or use real if available
function getAuth(req: Request) {
  const userId = req.headers.get("x-user-id");
  const orgId = req.headers.get("x-org-id");
  return { userId, orgId };
}

export async function createContext(opts: { req: Request }) {
  const { userId, orgId } = getAuth(opts.req);
  
  return {
    db: getDb(),
    orchestrator: getOrchestratorClient(),
    auth: { userId, orgId }
  };
}

export type Context = inferAsyncReturnType<typeof createContext>;