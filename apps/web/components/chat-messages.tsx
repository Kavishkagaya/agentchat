"use client";

import { createCodePlugin } from "@streamdown/code";
import { AlertCircle, Loader2 } from "lucide-react";
import { memo, useEffect, useRef } from "react";
import { Streamdown } from "streamdown";
import type { ChatMessage } from "@/types/chat";

const codePlugin = createCodePlugin({
  themes: ["github-light", "github-dark"],
});

type ChatMessagesProps = {
  messages: ChatMessage[];
  isThinking: boolean;
};

const MessageItem = memo(({ msg }: { msg: ChatMessage }) => {
  const isAssistant = msg.role === "assistant";
  const isError = msg.isError;

  return (
    <div className={`flex ${isAssistant ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[80%] rounded-lg p-3 ${
          isError
            ? "bg-destructive/10 border border-destructive text-destructive"
            : isAssistant
              ? "bg-muted"
              : "bg-primary text-primary-foreground"
        }`}
      >
        <div className="text-xs font-bold mb-1 font-mono flex items-center gap-1">
          {isError && <AlertCircle className="h-3 w-3" />}
          {isAssistant
            ? (msg.agent_nickname ?? "Assistant")
            : (msg.sender_name ?? "You")}
          {isError && msg.errorCode && (
            <span className="text-xs font-normal opacity-75">({msg.errorCode})</span>
          )}
        </div>
        {isAssistant && !isError ? (
          <Streamdown plugins={{ code: codePlugin }}>{msg.text}</Streamdown>
        ) : (
          <div className="whitespace-pre-wrap">{msg.text}</div>
        )}
      </div>
    </div>
  );
});
MessageItem.displayName = "MessageItem";

export const ChatMessages = memo(function ChatMessages({
  messages,
  isThinking,
}: ChatMessagesProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scroll to bottom when messages change or when thinking state changes
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  });

  return (
    <div className="flex-1 overflow-y-auto p-4" ref={scrollRef}>
      <div className="space-y-4">
        {messages.map((msg) => (
          <MessageItem key={msg.message_id} msg={msg} />
        ))}
        {isThinking && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-lg p-3 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Agents thinking...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
