import { getSandbox } from "@cloudflare/sandbox";
import type { SandboxEnv } from "./types";

/**
 * Get or create a persistent sandbox for the given agent.
 * Session ID is derived from agent_id to ensure reuse across tool calls.
 * Files and state persist in the sandbox across multiple tool calls.
 */
export function getSandboxForAgent(env: SandboxEnv, agentId: string) {
  return getSandbox(env.Sandbox, `agent-${agentId}`, { sleepAfter: "30m" });
}
