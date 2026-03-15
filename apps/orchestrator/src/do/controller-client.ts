import { sign } from "@axon/shared";
import type { Env } from "../env";

class ControllerClient {
  private getStub(env: Env, configId: string): DurableObjectStub {
    const id = env.MEMORY_CONTROLLER.idFromName(configId);
    return env.MEMORY_CONTROLLER.get(id);
  }

  private async createAuthHeaders(
    env: Env,
    extra: Record<string, string | null> = {},
  ): Promise<Headers> {
    const headers = new Headers();
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      sub: "orchestrator",
      iat: now,
      exp: now + 60,
      jti: crypto.randomUUID(),
    };
    const encodedPayload = btoa(JSON.stringify(payload));
    const signature = await sign(env.ORCHESTRATOR_PRIVATE_KEY, encodedPayload);
    headers.set("Authorization", `Bearer ${encodedPayload}.${signature}`);
    for (const [key, value] of Object.entries(extra)) {
      if (value) headers.set(key, value);
    }
    return headers;
  }

  private async fetch(
    env: Env,
    configId: string,
    path: string,
    options: {
      method?: string;
      headers?: Record<string, string>;
      body?: ReadableStream<Uint8Array> | string | null;
      preserveHeaders?: Headers;
    } = {},
  ): Promise<Response> {
    const stub = this.getStub(env, configId);
    const authHeaders = await this.createAuthHeaders(
      env,
      options.headers ?? {},
    );

    let finalHeaders: Headers;
    if (options.preserveHeaders) {
      finalHeaders = new Headers(options.preserveHeaders);
      for (const [key, value] of authHeaders.entries()) {
        finalHeaders.set(key, value);
      }
    } else {
      finalHeaders = authHeaders;
    }

    const url = `http://do${path}`;
    const request = new Request(url, {
      method: options.method ?? "GET",
      headers: finalHeaders,
      body: options.body,
    });

    return stub.fetch(request);
  }

  getDoIdString(env: Env, configId: string): string {
    return env.MEMORY_CONTROLLER.idFromName(configId).toString();
  }

  async init(
    env: Env,
    configId: string,
    body: { config_id: string; org_id: string; type: string },
  ): Promise<Response> {
    return this.fetch(env, configId, `/chats/${configId}/init`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async getMessages(
    env: Env,
    configId: string,
    queryString?: string,
  ): Promise<Response> {
    const qs = queryString ?? "";
    return this.fetch(env, configId, `/chats/${configId}/messages${qs}`);
  }

  async postMessage(
    env: Env,
    configId: string,
    body: ReadableStream<Uint8Array> | string | null,
  ): Promise<Response> {
    return this.fetch(env, configId, `/chats/${configId}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
  }

  async archive(env: Env, configId: string): Promise<Response> {
    return this.fetch(env, configId, `/chats/${configId}/archive`, {
      method: "POST",
    });
  }

  async destroy(env: Env, configId: string): Promise<Response> {
    return this.fetch(env, configId, `/chats/${configId}/destroy`, {
      method: "POST",
    });
  }

  async clearHistory(env: Env, configId: string): Promise<Response> {
    return this.fetch(env, configId, `/chats/${configId}/messages`, {
      method: "DELETE",
    });
  }

  async updateConfig(
    env: Env,
    configId: string,
    config: Record<string, unknown>,
  ): Promise<Response> {
    return this.fetch(env, configId, `/chats/${configId}/update-config`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ config }),
    });
  }

  async websocket(
    env: Env,
    configId: string,
    clientHeaders: Headers,
  ): Promise<Response> {
    return this.fetch(env, configId, `/chats/${configId}/ws`, {
      preserveHeaders: clientHeaders,
    });
  }

  async forward(
    env: Env,
    configId: string,
    path: string,
    options: {
      method?: string;
      body?: ReadableStream<Uint8Array> | string | null;
      preserveHeaders?: Headers;
    } = {},
  ): Promise<Response> {
    return this.fetch(env, configId, path, options);
  }
}

export const controllerClient = new ControllerClient();
