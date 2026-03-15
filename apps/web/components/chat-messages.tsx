"use client";

import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import type { ChatMessage } from "@/types/chat";

type ChatMessagesProps = {
  messages: ChatMessage[];
  isThinking: boolean;
};

export function ChatMessages({ messages, isThinking }: ChatMessagesProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto p-4" ref={scrollRef}>
      <div className="space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.message_id}
            className={`flex ${
              msg.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`max-w-[80%] rounded-lg p-3 ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted"
              }`}
            >
              <div className="text-xs font-bold mb-1">
                {msg.role === "user"
                  ? (msg.sender_name ?? "You")
                  : (msg.agent_nickname ?? "Assistant")}
              </div>
              <div className="whitespace-pre-wrap">{msg.text}</div>
            </div>
          </div>
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
}
