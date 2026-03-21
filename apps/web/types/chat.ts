import type { ChatHistoryMessage, MessageEvent } from "@axon/shared";

export type ChatMessage = Pick<
  ChatHistoryMessage,
  "message_id" | "role" | "text" | "sender_name" | "agent_id" | "agent_nickname"
> & {
  isPending?: boolean;
  isError?: boolean;
  errorCode?: string;
  events?: MessageEvent[];
};
