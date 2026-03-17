import type { z } from "zod";
import type {
  deleteFileSchema,
  execSchema,
  fileExistsSchema,
  listFilesSchema,
  mkdirSchema,
  readFileSchema,
  renameFileSchema,
  writeFileSchema,
} from "./schemas";

export type SandboxEnv = {
  Sandbox: DurableObjectNamespace<import("@cloudflare/sandbox").Sandbox>;
};

export type ExecArgs = z.infer<typeof execSchema>;
export type ReadFileArgs = z.infer<typeof readFileSchema>;
export type WriteFileArgs = z.infer<typeof writeFileSchema>;
export type ListFilesArgs = z.infer<typeof listFilesSchema>;
export type MkdirArgs = z.infer<typeof mkdirSchema>;
export type DeleteFileArgs = z.infer<typeof deleteFileSchema>;
export type FileExistsArgs = z.infer<typeof fileExistsSchema>;
export type RenameFileArgs = z.infer<typeof renameFileSchema>;
