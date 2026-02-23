import { z } from "zod";
import type { ToolExecutionContext, ToolImplementation } from "../types";

const httpMethodSchema = z.enum([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);

const httpArgsSchema = z.object({
  path: z.string().optional(),
  method: httpMethodSchema.optional(),
  query: z.record(z.string(), z.string()).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.any().optional(),
});

type HttpArgs = z.infer<typeof httpArgsSchema>;

type HttpToolConfig = {
  base_url?: string;
  allowed_methods?: string[];
  default_method?: string;
  default_headers?: Record<string, string>;
  default_query?: Record<string, string>;
  timeout_ms?: number;
  auto_approve?: boolean;
  response_format?: "auto" | "json" | "text";
  max_response_chars?: number;
};

const MAX_RESPONSE_CHARS = 20_000;
const DEFAULT_TIMEOUT_MS = 10_000;

function normalizeHttpConfig(
  raw: Record<string, unknown> | undefined
): HttpToolConfig {
  if (!raw) {
    return {};
  }
  return {
    base_url: typeof raw.base_url === "string" ? raw.base_url : undefined,
    allowed_methods: Array.isArray(raw.allowed_methods)
      ? raw.allowed_methods.filter(
          (value): value is string => typeof value === "string"
        )
      : undefined,
    default_method:
      typeof raw.default_method === "string" ? raw.default_method : undefined,
    default_headers:
      raw.default_headers && typeof raw.default_headers === "object"
        ? (raw.default_headers as Record<string, string>)
        : undefined,
    default_query:
      raw.default_query && typeof raw.default_query === "object"
        ? (raw.default_query as Record<string, string>)
        : undefined,
    timeout_ms: typeof raw.timeout_ms === "number" ? raw.timeout_ms : undefined,
    auto_approve: raw.auto_approve === true,
    response_format:
      raw.response_format === "json" || raw.response_format === "text"
        ? raw.response_format
        : "auto",
    max_response_chars:
      typeof raw.max_response_chars === "number"
        ? raw.max_response_chars
        : undefined,
  };
}

function toUpperMethod(method: string) {
  return method.trim().toUpperCase();
}

function isMutatingMethod(method: string) {
  return !["GET", "HEAD", "OPTIONS"].includes(method);
}

function mergeRecord(
  base: Record<string, string> | undefined,
  overrides: Record<string, string> | undefined
) {
  return { ...(base ?? {}), ...(overrides ?? {}) };
}

async function executeHttpTool(
  rawArgs: unknown,
  context: ToolExecutionContext
) {
  const args = httpArgsSchema.parse(rawArgs);
  const config = normalizeHttpConfig(context.tool.config);
  const rawPath = typeof args.path === "string" ? args.path.trim() : "";
  const hasAbsoluteUrl = rawPath.length > 0 && /^https?:\/\//i.test(rawPath);

  let url: URL;
  if (hasAbsoluteUrl) {
    try {
      url = new URL(rawPath);
    } catch {
      return { ok: false, error: "invalid absolute URL", path: rawPath };
    }
  } else {
    if (!config.base_url) {
      return { ok: false, error: "missing base_url in tool config" };
    }
    let baseUrl: URL;
    try {
      baseUrl = new URL(config.base_url);
    } catch {
      return { ok: false, error: "invalid base_url in tool config" };
    }
    try {
      url = new URL(rawPath, baseUrl);
    } catch {
      return { ok: false, error: "invalid path", path: rawPath };
    }
  }

  const method = toUpperMethod(args.method ?? config.default_method ?? "GET");
  const allowedMethods = (config.allowed_methods ?? ["GET", "HEAD"]).map(
    toUpperMethod
  );
  if (!allowedMethods.includes(method)) {
    return {
      ok: false,
      error: "method_not_allowed",
      method,
      allowed_methods: allowedMethods,
    };
  }

  if (isMutatingMethod(method) && !config.auto_approve) {
    return {
      ok: false,
      error: "approval_required",
      needs_approval: true,
      method,
      url: url.toString(),
    };
  }

  const query = mergeRecord(
    config.default_query as Record<string, string> | undefined,
    args.query as Record<string, string> | undefined
  );
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }

  const headers = mergeRecord(
    config.default_headers as Record<string, string> | undefined,
    args.headers as Record<string, string> | undefined
  );

  let body: BodyInit | undefined;
  if (args.body !== undefined && method !== "GET" && method !== "HEAD") {
    if (typeof args.body === "string") {
      body = args.body;
    } else {
      body = JSON.stringify(args.body);
      if (!headers["content-type"]) {
        headers["content-type"] = "application/json";
      }
    }
  }

  const controller = new AbortController();
  const timeoutMs = config.timeout_ms ?? DEFAULT_TIMEOUT_MS;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url.toString(), {
      method,
      headers,
      body,
      signal: controller.signal,
    });

    const contentType = response.headers.get("content-type") ?? "";
    const responseFormat = config.response_format ?? "auto";
    let data: unknown = null;

    if (
      responseFormat === "json" ||
      (responseFormat === "auto" && contentType.includes("json"))
    ) {
      try {
        data = await response.json();
      } catch {
        data = await response.text();
      }
    } else {
      data = await response.text();
    }

    if (typeof data === "string") {
      const maxChars = config.max_response_chars ?? MAX_RESPONSE_CHARS;
      if (data.length > maxChars) {
        data = `${data.slice(0, maxChars)}…`;
        return {
          ok: response.ok,
          status: response.status,
          status_text: response.statusText,
          url: url.toString(),
          method,
          data,
          truncated: true,
        };
      }
    }

    return {
      ok: response.ok,
      status: response.status,
      status_text: response.statusText,
      url: url.toString(),
      method,
      data,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "request failed";
    return { ok: false, error: message, url: url.toString(), method };
  } finally {
    clearTimeout(timeout);
  }
}

export function createDefaultTools(): ToolImplementation[] {
  return [
    {
      id: "echo",
      description: "Echo back the provided text.",
      schema: z.object({ text: z.string() }),
      execute: async (rawArgs) => {
        const input = z.object({ text: z.string() }).parse(rawArgs);
        return { ok: true, text: input.text };
      },
    },
    {
      id: "current_time",
      description: "Return the current time in ISO 8601 format.",
      schema: z.object({ timezone: z.string().optional() }),
      execute: async (rawArgs) => {
        const input = z
          .object({ timezone: z.string().optional() })
          .parse(rawArgs);
        const now = new Date();
        const timezone = input.timezone;
        let formatted: string | undefined;
        if (timezone) {
          try {
            formatted = new Intl.DateTimeFormat("en-US", {
              timeZone: timezone,
              dateStyle: "full",
              timeStyle: "long",
            }).format(now);
          } catch {
            // Fallback if timezone is invalid
          }
        }
        return {
          ok: true,
          iso: now.toISOString(),
          timezone: timezone ?? "UTC",
          formatted,
        };
      },
    },
    {
      id: "http_request",
      description:
        "Call an external HTTP API using the configured base URL and policy.",
      schema: httpArgsSchema,
      execute: executeHttpTool,
    },
  ];
}
