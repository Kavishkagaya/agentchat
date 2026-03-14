export async function readJson<T>(request: Request): Promise<T> {
  const text = await request.text();
  if (!text) {
    throw new Error("missing JSON body");
  }
  return JSON.parse(text) as T;
}

export function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`missing required field: ${field}`);
  }
  return value;
}

export function getBearerToken(request: Request): string {
  const raw = request.headers.get("authorization");
  if (!raw) {
    throw new Error("missing authorization header");
  }
  const [scheme, token] = raw.split(" ");
  if (scheme !== "Bearer" || !token) {
    throw new Error("invalid authorization header");
  }
  return token;
}

export function parseCleanupStatus(value: unknown): "active" | "archived" | "idle" {
  if (value === undefined) {
    return "idle";
  }
  if (value === "active" || value === "idle" || value === "archived") {
    return value;
  }
  throw new Error("invalid status");
}

export function parseConfigId(pathname: string, prefix: string): string | null {
  const parts = pathname.split("/");
  const idx = parts.indexOf(prefix.replace(/\//g, ""));
  if (idx !== -1 && parts.length > idx + 1) {
    return parts[idx + 1] ?? null;
  }
  return null;
}
