import Cloudflare from "cloudflare";

type CloudflareClient = {
  request?: (path: string, init?: RequestInit) => Promise<{ result?: unknown }>;
};

type WorkerResolutionCache = {
  subdomain?: string;
};

function getCache(): WorkerResolutionCache {
  const globalStore = globalThis as typeof globalThis & {
    __agentchatCfCache?: WorkerResolutionCache;
  };
  if (!globalStore.__agentchatCfCache) {
    globalStore.__agentchatCfCache = {};
  }
  return globalStore.__agentchatCfCache;
}

function getCloudflareClient(): CloudflareClient {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) {
    throw new Error("CLOUDFLARE_API_TOKEN is not set");
  }
  return new Cloudflare({ apiToken: token }) as unknown as CloudflareClient;
}

async function getWorkersSubdomain(): Promise<string> {
  const cached = getCache();
  if (cached.subdomain) {
    return cached.subdomain;
  }

  if (process.env.CLOUDFLARE_WORKERS_SUBDOMAIN) {
    cached.subdomain = process.env.CLOUDFLARE_WORKERS_SUBDOMAIN;
    return cached.subdomain;
  }

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!accountId) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID is not set");
  }

  const client = getCloudflareClient();
  if (!client.request) {
    throw new Error("Cloudflare SDK does not expose request()");
  }

  const response = await client.request(
    `/accounts/${accountId}/workers/subdomain`
  );
  const result = response?.result as { subdomain?: string } | undefined;

  if (!result?.subdomain) {
    throw new Error("Cloudflare subdomain lookup failed");
  }

  cached.subdomain = result.subdomain;
  return result.subdomain;
}

export async function resolveWorkerBaseUrl(
  workerName: string
): Promise<string> {
  const explicit =
    (workerName === "orchestrator"
      ? process.env.ORCHESTRATOR_BASE_URL
      : undefined) ??
    (workerName === "chat-controller"
      ? process.env.CHAT_CONTROLLER_BASE_URL
      : undefined) ??
    process.env[
      `WORKER_${workerName.toUpperCase().replace(/-/g, "_")}_BASE_URL`
    ];
  if (explicit) {
    return explicit.replace(/\/$/, "");
  }

  const subdomain = await getWorkersSubdomain();
  const suffix = process.env.CLOUDFLARE_WORKERS_DOMAIN ?? "workers.dev";
  return `https://${workerName}.${subdomain}.${suffix}`;
}
