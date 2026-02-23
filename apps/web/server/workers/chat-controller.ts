import { resolveWorkerBaseUrl } from "./cloudflare";

type AgentRuntimeRef = {
  agent_id: string;
  runtime_id: string;
  base_url: string;
};

type PostMessageRequest = {
  chat_id: string;
  message_id: string;
  text: string;
  agent_runtimes: AgentRuntimeRef[];
};

type PostMessageResponse = {
  ok: boolean;
  message_id: string;
  agent_messages: Array<{ message_id: string; role: string; text: string }>;
};

type ChatControllerClient = {
  postMessage: (payload: PostMessageRequest) => Promise<PostMessageResponse>;
  listMessages: (chatId: string) => Promise<{
    messages: Array<{
      message_id: string;
      role: string;
      text: string;
      created_at: string;
    }>;
  }>;
};

async function requestChatController<T>(
  path: string,
  payload?: unknown,
  method: "POST" | "GET" = "POST"
): Promise<T> {
  const baseUrl = await resolveWorkerBaseUrl("chat-controller");
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: payload ? JSON.stringify(payload) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Chat Controller error (${response.status}): ${text}`);
  }

  return (await response.json()) as T;
}

export function getChatControllerClient(): ChatControllerClient {
  return {
    postMessage: (payload) =>
      requestChatController<PostMessageResponse>(
        `/chats/${payload.chat_id}/messages`,
        payload
      ),
    listMessages: (chatId) =>
      requestChatController<{
        messages: Array<{
          message_id: string;
          role: string;
          text: string;
          created_at: string;
        }>;
      }>(`/chats/${chatId}/messages`, undefined, "GET"),
  };
}
