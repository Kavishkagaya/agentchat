import type { ToolImplementation } from "@axon/agent-factory";
import { getSandboxForAgent } from "../sandbox";
import { execSchema } from "../schemas";
import type { ExecArgs, SandboxEnv } from "../types";

export function createExecSkill(env: SandboxEnv): ToolImplementation {
  return {
    id: "sandbox_exec",
    description:
      "Execute a shell command in the agent sandbox. Files and state persist across calls. Use this for npm, git, python, bash, etc.",
    schema: execSchema,
    execute: async (args, context) => {
      const { command, args: cmdArgs = [], cwd } = args as ExecArgs;

      const sandbox = getSandboxForAgent(env, context.agent_id);
      const fullCmd = [command, ...cmdArgs].join(" ");
      const cmdToRun = cwd ? `cd ${cwd} && ${fullCmd}` : fullCmd;

      const result = await sandbox.exec(cmdToRun);

      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        ok: result.success,
        duration: result.duration,
      };
    },
  };
}
