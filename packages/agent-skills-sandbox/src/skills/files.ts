import type { ToolImplementation } from "@axon/agent-factory";
import { getSandboxForAgent } from "../sandbox";
import {
  deleteFileSchema,
  fileExistsSchema,
  listFilesSchema,
  readFileSchema,
  renameFileSchema,
  writeFileSchema,
} from "../schemas";
import type {
  DeleteFileArgs,
  FileExistsArgs,
  ListFilesArgs,
  ReadFileArgs,
  RenameFileArgs,
  SandboxEnv,
  WriteFileArgs,
} from "../types";

export function createReadFileSkill(env: SandboxEnv): ToolImplementation {
  return {
    id: "sandbox_read_file",
    description: "Read a file from the agent sandbox. Returns file content.",
    schema: readFileSchema,
    execute: async (args, context) => {
      const { path } = args as ReadFileArgs;

      const sandbox = getSandboxForAgent(env, context.agent_id);
      const file = await sandbox.readFile(path, { encoding: "utf-8" });

      return { content: file.content, path: file.path, ok: true };
    },
  };
}

export function createWriteFileSkill(env: SandboxEnv): ToolImplementation {
  return {
    id: "sandbox_write_file",
    description: "Write or create a file in the agent sandbox.",
    schema: writeFileSchema,
    execute: async (args, context) => {
      const { path, content } = args as WriteFileArgs;

      const sandbox = getSandboxForAgent(env, context.agent_id);
      await sandbox.writeFile(path, content, { encoding: "utf-8" });

      return { ok: true, path };
    },
  };
}

export function createListFilesSkill(env: SandboxEnv): ToolImplementation {
  return {
    id: "sandbox_list_files",
    description: "List files and directories in the agent sandbox.",
    schema: listFilesSchema,
    execute: async (args, context) => {
      const { path, recursive = false } = args as ListFilesArgs;

      const sandbox = getSandboxForAgent(env, context.agent_id);
      const files = await sandbox.listFiles(path, {
        recursive,
        includeHidden: false,
      });

      return { files, ok: true };
    },
  };
}

export function createDeleteFileSkill(env: SandboxEnv): ToolImplementation {
  return {
    id: "sandbox_delete_file",
    description: "Delete a file or directory from the agent sandbox.",
    schema: deleteFileSchema,
    execute: async (args, context) => {
      const { path } = args as DeleteFileArgs;

      const sandbox = getSandboxForAgent(env, context.agent_id);
      await sandbox.deleteFile(path);

      return { ok: true };
    },
  };
}

export function createFileExistsSkill(env: SandboxEnv): ToolImplementation {
  return {
    id: "sandbox_file_exists",
    description: "Check if a file or directory exists in the agent sandbox.",
    schema: fileExistsSchema,
    execute: async (args, context) => {
      const { path } = args as FileExistsArgs;

      const sandbox = getSandboxForAgent(env, context.agent_id);
      const exists = await sandbox.exists(path);

      return { exists, ok: true };
    },
  };
}

export function createRenameFileSkill(env: SandboxEnv): ToolImplementation {
  return {
    id: "sandbox_rename_file",
    description: "Rename or move a file in the agent sandbox.",
    schema: renameFileSchema,
    execute: async (args, context) => {
      const { from, to } = args as RenameFileArgs;

      const sandbox = getSandboxForAgent(env, context.agent_id);
      await sandbox.renameFile(from, to);

      return { ok: true };
    },
  };
}
