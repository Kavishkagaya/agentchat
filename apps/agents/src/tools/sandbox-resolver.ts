import { getSandbox } from "@cloudflare/sandbox";
import type { SandboxResolver, SandboxSession } from "@axon/shared";
import type { Env } from "../env";

/**
 * Create a CF-specific implementation of SandboxResolver.
 * This resolver uses Cloudflare's @cloudflare/sandbox to create persistent
 * sandbox sessions keyed by agent ID. Sessions persist for 30 minutes.
 *
 * Adapts the Cloudflare Sandbox type to our SandboxSession interface.
 */
export function createCfSandboxResolver(env: Env): SandboxResolver {
  return (agentId: string) => {
    const cfSandbox = getSandbox(env.Sandbox, `agent-${agentId}`, {
      sleepAfter: "30m",
    });

    // Adapt Cloudflare's Sandbox to our SandboxSession interface
    const adapted: SandboxSession = {
      async exec(cmd: string, opts?: { cwd?: string }) {
        const result = await cfSandbox.exec(cmd);
        return {
          stdout: result.stdout ?? "",
          stderr: result.stderr ?? "",
          exitCode: result.exitCode ?? 1,
          duration: result.duration,
        };
      },
      async readFile(path: string, opts?: { encoding?: string }) {
        const result = await cfSandbox.readFile(path, opts);
        return result.content ?? "";
      },
      async writeFile(path: string, content: string, opts?: { encoding?: string }) {
        await cfSandbox.writeFile(path, content, opts);
      },
      async listFiles(path: string, opts?: { recursive?: boolean; includeHidden?: boolean }) {
        const result = await cfSandbox.listFiles(path, opts);
        return result.files ?? [];
      },
      async mkdir(path: string, opts?: { recursive?: boolean }) {
        await cfSandbox.mkdir(path, opts);
      },
      async deleteFile(path: string) {
        await cfSandbox.deleteFile(path);
      },
      async exists(path: string) {
        const result = await cfSandbox.exists(path);
        return result.exists ?? false;
      },
      async renameFile(from: string, to: string) {
        await cfSandbox.renameFile(from, to);
      },
    };

    return adapted;
  };
}
