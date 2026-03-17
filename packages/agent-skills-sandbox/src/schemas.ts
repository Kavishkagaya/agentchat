import { z } from "zod";

export const execSchema = z.object({
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

export const readFileSchema = z.object({
  path: z
    .string()
    .describe('File path to read (e.g. "/workspace/src/main.ts")'),
});

export const writeFileSchema = z.object({
  path: z.string().describe("File path to write to"),
  content: z.string().describe("File contents"),
});

export const listFilesSchema = z.object({
  path: z.string().describe("Directory path to list"),
  recursive: z.boolean().optional().describe("Recursively list subdirectories"),
});

export const mkdirSchema = z.object({
  path: z.string().describe("Directory path to create"),
});

export const deleteFileSchema = z.object({
  path: z.string().describe("File or directory path to delete"),
});

export const fileExistsSchema = z.object({
  path: z.string().describe("File or directory path to check"),
});

export const renameFileSchema = z.object({
  from: z.string().describe("Source file or directory path"),
  to: z.string().describe("Destination file or directory path"),
});
