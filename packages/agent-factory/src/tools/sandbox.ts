import { z } from "zod";
import type { SandboxResolver } from "@axon/shared";
import type { ToolImplementation } from "../types";

// ── Zod Schemas ──

const execSchema = z.object({
  command: z
    .string()
    .describe('Shell command to run (e.g. "npm", "git", "python3", "ls")'),
  args: z
    .array(z.string())
    .optional()
    .describe("Command arguments as separate strings"),
  cwd: z
    .string()
    .optional()
    .describe("Working directory path (default: /workspace)"),
});

const readFileSchema = z.object({
  path: z
    .string()
    .describe('File path to read (e.g. "/workspace/src/main.ts")'),
});

const writeFileSchema = z.object({
  path: z.string().describe("File path to write to"),
  content: z.string().describe("File contents"),
});

const listFilesSchema = z.object({
  path: z.string().describe("Directory path to list"),
  recursive: z.boolean().optional().describe("Recursively list subdirectories"),
});

const mkdirSchema = z.object({
  path: z.string().describe("Directory path to create"),
});

const deleteFileSchema = z.object({
  path: z.string().describe("File or directory path to delete"),
});

const fileExistsSchema = z.object({
  path: z.string().describe("File or directory path to check"),
});

const renameFileSchema = z.object({
  from: z.string().describe("Source file or directory path"),
  to: z.string().describe("Destination file or directory path"),
});

// ── Tool Implementations ──

/**
 * Create all 8 sandbox tools for agents.
 * Each tool uses the provided resolver to get a SandboxSession for the agent.
 * Files and state persist across multiple tool calls within a session.
 */
export function createSandboxTools(resolver: SandboxResolver): ToolImplementation[] {
  return [
    {
      id: "sandbox_exec",
      description:
        "Execute a shell command in the agent sandbox. Files and state persist across calls. Use this for npm, git, python, bash, etc.",
      schema: execSchema,
      execute: async (args, context) => {
        const { command, args: cmdArgs = [], cwd } = args as z.infer<typeof execSchema>;
        const sandbox = await resolver(context.agent_id);
        const fullCmd = [command, ...cmdArgs].join(" ");
        const cmdToRun = cwd ? `cd ${cwd} && ${fullCmd}` : fullCmd;

        const result = await sandbox.exec(cmdToRun);

        return {
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
          ok: result.exitCode === 0,
          duration: result.duration,
        };
      },
    },
    {
      id: "sandbox_read_file",
      description: "Read a file from the agent sandbox. Returns file content.",
      schema: readFileSchema,
      execute: async (args, context) => {
        const { path } = args as z.infer<typeof readFileSchema>;
        const sandbox = await resolver(context.agent_id);
        const content = await sandbox.readFile(path, { encoding: "utf-8" });

        return { content, path, ok: true };
      },
    },
    {
      id: "sandbox_write_file",
      description: "Write or create a file in the agent sandbox.",
      schema: writeFileSchema,
      execute: async (args, context) => {
        const { path, content } = args as z.infer<typeof writeFileSchema>;
        const sandbox = await resolver(context.agent_id);
        await sandbox.writeFile(path, content, { encoding: "utf-8" });

        return { ok: true, path };
      },
    },
    {
      id: "sandbox_list_files",
      description: "List files and directories in the agent sandbox.",
      schema: listFilesSchema,
      execute: async (args, context) => {
        const { path, recursive = false } = args as z.infer<typeof listFilesSchema>;
        const sandbox = await resolver(context.agent_id);
        const files = await sandbox.listFiles(path, {
          recursive,
          includeHidden: false,
        });

        return { files, ok: true };
      },
    },
    {
      id: "sandbox_mkdir",
      description:
        "Create a directory in the agent sandbox. Creates parent directories if needed.",
      schema: mkdirSchema,
      execute: async (args, context) => {
        const { path } = args as z.infer<typeof mkdirSchema>;
        const sandbox = await resolver(context.agent_id);
        await sandbox.mkdir(path, { recursive: true });

        return { ok: true };
      },
    },
    {
      id: "sandbox_delete_file",
      description: "Delete a file or directory from the agent sandbox.",
      schema: deleteFileSchema,
      execute: async (args, context) => {
        const { path } = args as z.infer<typeof deleteFileSchema>;
        const sandbox = await resolver(context.agent_id);
        await sandbox.deleteFile(path);

        return { ok: true };
      },
    },
    {
      id: "sandbox_file_exists",
      description: "Check if a file or directory exists in the agent sandbox.",
      schema: fileExistsSchema,
      execute: async (args, context) => {
        const { path } = args as z.infer<typeof fileExistsSchema>;
        const sandbox = await resolver(context.agent_id);
        const exists = await sandbox.exists(path);

        return { exists, ok: true };
      },
    },
    {
      id: "sandbox_rename_file",
      description: "Rename or move a file in the agent sandbox.",
      schema: renameFileSchema,
      execute: async (args, context) => {
        const { from, to } = args as z.infer<typeof renameFileSchema>;
        const sandbox = await resolver(context.agent_id);
        await sandbox.renameFile(from, to);

        return { ok: true };
      },
    },
  ];
}
