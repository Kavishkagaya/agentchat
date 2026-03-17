import type { ToolImplementation } from "@axon/agent-factory";
import { getSandboxForAgent } from "../sandbox";
import { mkdirSchema } from "../schemas";
import type { MkdirArgs, SandboxEnv } from "../types";

export function createMkdirSkill(env: SandboxEnv): ToolImplementation {
  return {
    id: "sandbox_mkdir",
    description:
      "Create a directory in the agent sandbox. Creates parent directories if needed.",
    schema: mkdirSchema,
    execute: async (args, context) => {
      const { path } = args as MkdirArgs;

      const sandbox = getSandboxForAgent(env, context.agent_id);
      await sandbox.mkdir(path, { recursive: true });

      return { ok: true };
    },
  };
}
