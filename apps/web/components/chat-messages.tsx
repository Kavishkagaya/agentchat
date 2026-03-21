"use client";

import { createCodePlugin } from "@streamdown/code";
import { AlertCircle, Loader2 } from "lucide-react";
import { memo, useEffect, useRef } from "react";
import { Streamdown } from "streamdown";
import type { MessageEvent } from "@axon/shared";
import type { ChatMessage } from "@/types/chat";

const codePlugin = createCodePlugin({
  themes: ["github-light", "github-dark"],
});

type ChatMessagesProps = {
  messages: ChatMessage[];
  isThinking: boolean;
};

const ToolEventLog = memo(({ events }: { events: MessageEvent[] }) => {
  return (
    <div className="text-xs text-muted-foreground space-y-2 mb-2">
      {events.map((evt) => {
        if (evt.event_type === "tool_call") {
          const toolData = evt.data as Record<string, unknown>;
          const toolCallId = toolData.tool_call_id as string;
          const name = toolData.name as string;
          const args = toolData.args;

          const resultEvent = events.find(
            (e) =>
              e.event_type === "tool_result" &&
              (e.data?.tool_call_id as string) === toolCallId,
          );
          const errorEvent = events.find(
            (e) =>
              e.event_type === "tool_error" &&
              (e.data?.tool_call_id as string) === toolCallId,
          );

          return (
            <details key={toolCallId} className="cursor-pointer">
              <summary className="hover:opacity-80">
                {errorEvent ? (
                  <span className="text-destructive">
                    🔧 {name} — error
                  </span>
                ) : (
                  <span>
                    🔧 {name}
                  </span>
                )}
              </summary>
              <div className="pl-4 mt-1 space-y-1 font-mono text-xs whitespace-pre-wrap break-words">
                <div className="text-muted-foreground">
                  Args: {JSON.stringify(args, null, 2)}
                </div>
                {resultEvent && (
                  <div className="text-green-600 dark:text-green-400">
                    Result: {JSON.stringify(resultEvent.data?.result, null, 2)}
                  </div>
                )}
                {errorEvent && (
                  <div className="text-destructive">
                    Error: {errorEvent.data?.error as string}
                  </div>
                )}
              </div>
            </details>
          );
        }

        if (evt.event_type === "routing_warning") {
          const warnData = evt.data as Record<string, unknown>;
          const unknownMentions = warnData.unknown_mentions as string[];
          const key = `routing_warning_${unknownMentions.join("_")}_${evt.created_at}`;
          return (
            <div key={key} className="text-amber-600 dark:text-amber-500">
              ⚠️ Unknown mention(s): {unknownMentions.join(", ")}
            </div>
          );
        }

        return null;
      })}
    </div>
  );
});
ToolEventLog.displayName = "ToolEventLog";

const MessageItem = memo(({ msg }: { msg: ChatMessage }) => {
  const isAssistant = msg.role === "assistant";
  const isError = msg.isError;
  const hasEvents = msg.events && msg.events.length > 0;

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
        {isAssistant && hasEvents && <ToolEventLog events={msg.events} />}
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
