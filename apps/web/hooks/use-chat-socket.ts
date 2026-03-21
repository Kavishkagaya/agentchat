"use client";

import type { ChatHistoryMessage, ChatWsEvent } from "@axon/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/app/trpc/client";
import type { ChatMessage } from "@/types/chat";

function mapHistoryMessage(m: ChatHistoryMessage): ChatMessage {
  // Strip "[agent_name]: " prefix — agents may echo this from context format
  let text = m.text;
  if (m.role === "assistant" && text.match(/^\[.+?\]: /)) {
    text = text.replace(/^\[.+?\]: /, "");
  }

  return {
    message_id: m.message_id,
    role: m.role,
    text,
    sender_name: m.sender_name,
    agent_id: m.agent_id,
    agent_nickname: m.agent_nickname,
    events: m.events,
  };
}

type ConnectionStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "reconnecting";

const MAX_RECONNECT_ATTEMPTS = 8;
const BASE_RECONNECT_DELAY_MS = 1500;

export function useChatSocket(chatId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("connecting");

  const socketRef = useRef<WebSocket | null>(null);
  const connectingRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);

  const getTokenMutation = api.chats.getToken.useMutation();
  const { data: historyData } = api.chats.getHistory.useQuery({ chatId });
  const getTokenRef = useRef(getTokenMutation.mutateAsync);

  // Hydrate from history (only if no messages yet)
  useEffect(() => {
    if (historyData?.messages) {
      setMessages((prev) =>
        prev.length === 0
          ? (historyData.messages as ChatHistoryMessage[]).map(
              mapHistoryMessage,
            )
          : prev,
      );
    }
  }, [historyData]);

  // Update getTokenRef without triggering reconnections
  useEffect(() => {
    getTokenRef.current = getTokenMutation.mutateAsync;
  });

  // WebSocket lifecycle
  useEffect(() => {
    if (connectingRef.current) return;
    connectingRef.current = true;

    let cancelled = false;

    const connect = async () => {
      setConnectionStatus(
        reconnectAttemptsRef.current === 0 ? "connecting" : "reconnecting",
      );

      try {
        const { routing_token } = await getTokenRef.current({
          chatId,
        });

        if (cancelled) return;

        const baseUrl =
          process.env.NEXT_PUBLIC_ORCHESTRATOR_URL || "http://localhost:8789";
        const wsBaseUrl = baseUrl.replace(/^http/, "ws");
        const wsUrl = `${wsBaseUrl}/chats/${chatId}/ws?token=${routing_token}`;

        const socket = new WebSocket(wsUrl);
        socketRef.current = socket;

        socket.onopen = () => {
          if (cancelled) {
            socket.close();
            return;
          }
          console.log("WS connected, waiting for ready...");
        };

        socket.onmessage = (event) => {
          if (cancelled) return;
          const data = JSON.parse(event.data) as ChatWsEvent;
          handleEvent(data);
        };

        socket.onclose = () => {
          setIsConnected(false);
          if (cancelled) return; // intentional cleanup, don't retry

          const attempt = reconnectAttemptsRef.current;
          if (attempt < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttemptsRef.current += 1;
            const delay = Math.min(
              BASE_RECONNECT_DELAY_MS * 2 ** attempt,
              30_000,
            );
            setConnectionStatus("reconnecting");
            reconnectTimerRef.current = setTimeout(() => {
              if (!cancelled) connect();
            }, delay);
          } else {
            setConnectionStatus("disconnected");
          }
        };
      } catch (err) {
        console.error("Failed to connect WS:", err);
        if (!cancelled) {
          const attempt = reconnectAttemptsRef.current;
          if (attempt < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttemptsRef.current += 1;
            const delay = Math.min(
              BASE_RECONNECT_DELAY_MS * 2 ** attempt,
              30_000,
            );
            setConnectionStatus("reconnecting");
            reconnectTimerRef.current = setTimeout(() => {
              if (!cancelled) connect();
            }, delay);
          } else {
            setConnectionStatus("disconnected");
          }
        }
      }
    };

    const handleEvent = (data: ChatWsEvent) => {
      switch (data.type) {
        case "initializing":
          setIsInitializing(true);
          break;

        case "ready":
          setIsInitializing(false);
          setIsConnected(true);
          setConnectionStatus("connected");
          reconnectAttemptsRef.current = 0; // reset on successful connect
          break;

        case "user_message_stored":
          setMessages((prev) => [
            ...prev,
            {
              role: "user",
              text: data.text,
              sender_name: data.sender_name,
              message_id: data.message_id,
            },
          ]);
          break;

        case "agent_start":
          setIsThinking(true);
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              text: "",
              agent_id: data.agent_id,
              agent_nickname: data.agent_nickname,
              message_id: data.message_id,
              isPending: true,
            },
          ]);
          break;

        case "tool_call":
          setMessages((prev) =>
            prev.map((m) =>
              m.message_id === data.message_id
                ? {
                    ...m,
                    events: [
                      ...(m.events ?? []),
                      {
                        event_type: "tool_call",
                        data: {
                          tool_call_id: data.tool_call_id,
                          name: data.name,
                          args: data.args,
                        },
                        created_at: new Date().toISOString(),
                      },
                    ],
                  }
                : m,
            ),
          );
          break;

        case "tool_result":
          setMessages((prev) =>
            prev.map((m) =>
              m.message_id === data.message_id
                ? {
                    ...m,
                    events: [
                      ...(m.events ?? []),
                      {
                        event_type: "tool_result",
                        data: {
                          tool_call_id: data.tool_call_id,
                          name: data.name,
                          result: data.result,
                        },
                        created_at: new Date().toISOString(),
                      },
                    ],
                  }
                : m,
            ),
          );
          break;

        case "tool_error":
          setMessages((prev) =>
            prev.map((m) =>
              m.message_id === data.message_id
                ? {
                    ...m,
                    events: [
                      ...(m.events ?? []),
                      {
                        event_type: "tool_error",
                        data: {
                          tool_call_id: data.tool_call_id,
                          name: data.name,
                          error: data.error,
                        },
                        created_at: new Date().toISOString(),
                      },
                    ],
                  }
                : m,
            ),
          );
          break;

        case "agent_message":
          setMessages((prev) =>
            prev.map((m) =>
              m.message_id === data.message_id
                ? {
                    ...m,
                    text: data.text,
                    agent_nickname: data.agent_nickname,
                    isPending: false,
                  }
                : m,
            ),
          );
          break;

        case "agent_error":
          setMessages((prev) =>
            prev.map((m) =>
              m.message_id === data.message_id
                ? {
                    ...m,
                    text: data.message,
                    isPending: false,
                    isError: true,
                    errorCode: data.code,
                  }
                : m,
            ),
          );
          setIsThinking(false);
          break;

        case "routing_warning":
          setMessages((prev) =>
            prev.map((m) =>
              m.message_id === data.message_id
                ? {
                    ...m,
                    events: [
                      ...(m.events ?? []),
                      {
                        event_type: "routing_warning",
                        data: {
                          unknown_mentions: data.unknown_mentions,
                          source: data.source,
                          origin: data.origin,
                        },
                        created_at: new Date().toISOString(),
                      },
                    ],
                  }
                : m,
            ),
          );
          break;

        case "agent_status":
          // Update thinking indicator if needed, but events array is for displaying in UI
          break;

        case "reasoning":
          // Reasoning events are stream-only, not in coarse mode
          break;

        case "history_cleared":
          setMessages([]);
          break;

        case "done":
          setIsThinking(false);
          break;

        case "error":
          console.error("WS Error:", data.message);
          setIsThinking(false);
          break;
      }
    };

    connect();

    return () => {
      cancelled = true;
      connectingRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [chatId]);

  const sendMessage = useCallback((text: string, agent_ids?: string[]) => {
    const payload: Record<string, unknown> = { type: "message", text };
    if (agent_ids?.length) {
      payload.agent_ids = agent_ids;
    }
    socketRef.current?.send(JSON.stringify(payload));
  }, []);

  return {
    messages,
    isThinking,
    isConnected,
    isInitializing,
    sendMessage,
    connectionStatus,
  };
}
