"use client";

import { Edit, Loader2, Send, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/app/trpc/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Message = {
  role: string;
  text: string;
  sender_name?: string | null;
  agent_name?: string | null;
  message_id: string;
  isStreaming?: boolean;
};

type AgentItem = { id: string; name: string };

export function ChatClient({ chatId }: { chatId: string }) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editForm, setEditForm] = useState({ title: "", agentIds: [] as string[] });
  const [editInitialized, setEditInitialized] = useState(false);

  const chatQuery = api.chats.get.useQuery({ chatId });
  const agentsQuery = api.agents.list.useQuery();
  const { data: historyData } = api.chats.getHistory.useQuery({ chatId });
  const getTokenMutation = api.chats.getToken.useMutation();
  const updateChat = api.chats.update.useMutation();
  const deleteChatMutation = api.chats.delete.useMutation();

  // Initialize edit form from chat data
  useMemo(() => {
    if (chatQuery.data && !editInitialized) {
      setEditForm({
        title: chatQuery.data.title,
        agentIds: chatQuery.data.agents?.map((a: { agentId: string }) => a.agentId) ?? [],
      });
      setEditInitialized(true);
    }
  }, [chatQuery.data, editInitialized]);

  useEffect(() => {
    if (historyData?.messages) {
      setMessages(
        historyData.messages.map((m: any) => ({
          role: m.role,
          text: m.text,
          sender_name: m.sender_name,
          agent_name: m.agent_id,
          message_id: m.message_id,
        })),
      );
    }
  }, [historyData]);

  useEffect(() => {
    let socket: WebSocket | null = null;

    const connect = async () => {
      try {
        const { routing_token } = await getTokenMutation.mutateAsync({
          chatId,
        });

        const baseUrl =
          process.env.NEXT_PUBLIC_ORCHESTRATOR_URL || "http://localhost:8789";
        const wsBaseUrl = baseUrl.replace(/^http/, "ws");
        const wsUrl = `${wsBaseUrl}/chats/${chatId}/ws?token=${routing_token}`;

        socket = new WebSocket(wsUrl);

        socket.onopen = () => console.log("WS connected");
        socket.onmessage = (event) => {
          const data = JSON.parse(event.data);
          handleWsMessage(data);
        };
        socket.onclose = () => console.log("WS closed");

        setWs(socket);
      } catch (err) {
        console.error("Failed to connect WS:", err);
      }
    };

    connect();

    return () => {
      socket?.close();
    };
  }, [chatId]);

  const handleWsMessage = (data: any) => {
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
            agent_name: data.agent_id,
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
                  agent_name: data.agent_name,
                  isStreaming: false,
                }
              : m,
          ),
        );
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

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = () => {
    if (!inputText.trim() || !ws) return;

    ws.send(
      JSON.stringify({
        type: "message",
        text: inputText,
      }),
    );
    setInputText("");
  };

  const handleUpdate = async () => {
    if (!editForm.title.trim()) return;
    await updateChat.mutateAsync({
      chatId,
      title: editForm.title,
      agentIds: editForm.agentIds,
    });
    await chatQuery.refetch();
    setEditOpen(false);
  };

  const handleDelete = async () => {
    await deleteChatMutation.mutateAsync({ chatId });
    router.push("/dashboard");
  };

  const toggleAgent = (agentId: string) => {
    setEditForm((prev) => ({
      ...prev,
      agentIds: prev.agentIds.includes(agentId)
        ? prev.agentIds.filter((id) => id !== agentId)
        : [...prev.agentIds, agentId],
    }));
  };

  const chatTitle = chatQuery.data?.title ?? "Loading...";

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)]">
      <Card className="flex-1 flex flex-col overflow-hidden">
        <CardHeader className="border-b pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-lg">{chatTitle}</CardTitle>
          <div className="flex gap-1">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => {
                setEditForm({
                  title: chatQuery.data?.title ?? "",
                  agentIds: chatQuery.data?.agents?.map((a: { agentId: string }) => a.agentId) ?? [],
                });
                setEditOpen(true);
              }}
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </CardHeader>
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
                      : (msg.agent_name ?? "Assistant")}
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
        <CardContent className="p-4 border-t flex gap-2">
          <Input
            placeholder="Type your message..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          />
          <Button onClick={sendMessage} disabled={!ws || isThinking}>
            <Send className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>

      {/* Edit Chat Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Chat</DialogTitle>
            <DialogDescription>
              Update the chat title and agent assignments.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-title">Title</Label>
              <Input
                id="edit-title"
                value={editForm.title}
                onChange={(e) =>
                  setEditForm({ ...editForm, title: e.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label>Agents</Label>
              {agentsQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading agents...</p>
              ) : agentsQuery.data?.length === 0 ? (
                <p className="text-sm text-muted-foreground">No agents available.</p>
              ) : (
                <div className="grid gap-2 max-h-48 overflow-y-auto">
                  {agentsQuery.data?.map((agent: AgentItem) => (
                    <button
                      key={agent.id}
                      type="button"
                      className={`rounded-md border p-2 text-left text-sm transition-colors ${
                        editForm.agentIds.includes(agent.id)
                          ? "border-primary bg-primary/10"
                          : "hover:bg-muted"
                      }`}
                      onClick={() => toggleAgent(agent.id)}
                    >
                      {agent.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={!editForm.title.trim() || updateChat.isPending}
            >
              {updateChat.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete chat</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{chatTitle}&quot;? This action
              cannot be undone and all message history will be permanently removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteChatMutation.isPending}
            >
              {deleteChatMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
