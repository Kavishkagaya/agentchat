"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/app/trpc/client";
import type { ChatWsEvent, ChatHistoryMessage } from "@axon/shared";
import type { ChatMessage } from "@/types/chat";

function mapHistoryMessage(m: ChatHistoryMessage): ChatMessage {
  // Legacy data may have "[agent_name]: text" prefix — strip it for display
  let text = m.text;
  if (m.role === "assistant" && !m.agent_nickname && text.match(/^\[.+?\]: /)) {
    text = text.replace(/^\[.+?\]: /, "");
  }

  return {
    message_id: m.message_id,
    role: m.role,
    text,
    sender_name: m.sender_name,
    agent_id: m.agent_id,
    agent_nickname: m.agent_nickname,
  };
}

export function useChatSocket(chatId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const connectingRef = useRef(false);

  const getTokenMutation = api.chats.getToken.useMutation();
  const { data: historyData } = api.chats.getHistory.useQuery({ chatId });

  // Hydrate from history (only if no messages yet)
  useEffect(() => {
    if (historyData?.messages) {
      setMessages((prev) =>
        prev.length === 0
          ? (historyData.messages as ChatHistoryMessage[]).map(mapHistoryMessage)
          : prev,
      );
    }
  }, [historyData]);

  // WebSocket lifecycle
  useEffect(() => {
    if (connectingRef.current) return;
    connectingRef.current = true;

    let cancelled = false;

    const connect = async () => {
      try {
        const { routing_token } = await getTokenMutation.mutateAsync({
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
          setIsConnected(true);
          console.log("WS connected");
        };

        socket.onmessage = (event) => {
          const data = JSON.parse(event.data) as ChatWsEvent;
          handleEvent(data);
        };

        socket.onclose = () => {
          setIsConnected(false);
          console.log("WS closed");
        };
      } catch (err) {
        console.error("Failed to connect WS:", err);
      }
    };

    const handleEvent = (data: ChatWsEvent) => {
      switch (data.type) {
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
              isStreaming: true,
            },
          ]);
          break;

        case "text_delta":
          setMessages((prev) =>
            prev.map((m) =>
              m.message_id === data.message_id
                ? { ...m, text: m.text + data.text }
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
                    isStreaming: false,
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
                    text: `Error: ${data.message}`,
                    isStreaming: false,
                  }
                : m,
            ),
          );
          setIsThinking(false);
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
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [chatId]);

  const sendMessage = useCallback((text: string) => {
    socketRef.current?.send(
      JSON.stringify({ type: "message", text }),
    );
  }, []);

  return { messages, isThinking, isConnected, sendMessage };
}
