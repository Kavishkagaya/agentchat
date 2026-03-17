import type { ToolImplementation } from "@axon/agent-factory";
import { createExecSkill } from "./skills/exec";
import {
  createDeleteFileSkill,
  createFileExistsSkill,
  createListFilesSkill,
  createReadFileSkill,
  createRenameFileSkill,
  createWriteFileSkill,
} from "./skills/files";
import { createMkdirSkill } from "./skills/mkdir";
import type { SandboxEnv } from "./types";

export type { SandboxEnv };

/**
 * Create sandbox skills for agents.
 * Each skill uses a persistent sandbox session per agent_id.
 * Files and state persist across multiple tool calls.
 */
export function createSandboxSkills(env: SandboxEnv): ToolImplementation[] {
  return [
    createExecSkill(env),
    createReadFileSkill(env),
    createWriteFileSkill(env),
    createListFilesSkill(env),
    createMkdirSkill(env),
    createDeleteFileSkill(env),
    createFileExistsSkill(env),
    createRenameFileSkill(env),
  ];
}
