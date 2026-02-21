import type { inferAsyncReturnType } from "@trpc/server";
import { getDb } from "../db";
import { getOrchestratorClient } from "../workers/orchestrator";
import { getChatControllerClient } from "../workers/chat-controller";

export function createContext() {
  return {
    db: getDb(),
    orchestrator: getOrchestratorClient(),
    chatController: getChatControllerClient()
  };
}

export type Context = inferAsyncReturnType<typeof createContext>;
