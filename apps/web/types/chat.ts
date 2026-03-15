import type { ChatHistoryMessage } from "@axon/shared";

export type ChatMessage = Pick<
  ChatHistoryMessage,
  "message_id" | "role" | "text" | "sender_name" | "agent_id" | "agent_nickname"
> & {
  isStreaming?: boolean;
};
