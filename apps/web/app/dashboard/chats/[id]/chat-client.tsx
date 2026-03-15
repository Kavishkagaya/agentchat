"use client";

import { normalizeChatRoutingConfig } from "@axon/shared";
import { Edit, Eraser, Send, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { api } from "@/app/trpc/client";
import {
  type ChatFormData,
  ChatFormDialog,
  type ChatFormInitialData,
} from "@/components/chat-form-dialog";
import { ChatMessages } from "@/components/chat-messages";
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
import { useChatSocket } from "@/hooks/use-chat-socket";

export function ChatClient({ chatId }: { chatId: string }) {
  const router = useRouter();
  const [inputText, setInputText] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { messages, isThinking, isConnected, sendMessage, connectionStatus } =
    useChatSocket(chatId);

  const chatQuery = api.chats.get.useQuery({ chatId });
  const agentsQuery = api.agents.list.useQuery();
  const updateChat = api.chats.update.useMutation();
  const clearHistoryMutation = api.chats.clearHistory.useMutation();
  const deleteChatMutation = api.chats.delete.useMutation();

  const editInitialData = useMemo((): ChatFormInitialData | undefined => {
    if (!chatQuery.data) return undefined;
    const rawConfig = chatQuery.data.config as Record<string, unknown> | null;
    const config = normalizeChatRoutingConfig(rawConfig);
    return {
      title: chatQuery.data.title,
      agentSetups: config.agent_setups,
      config: {
        auto: config.auto,
        default_agent: config.default_agent,
        trigger_depth_limit: config.trigger_depth_limit,
        history_mode: config.history_mode,
        compaction_threshold: config.compaction_threshold,
      },
    };
  }, [chatQuery.data]);

  const handleSend = () => {
    if (!inputText.trim() || !isConnected) return;
    sendMessage(inputText);
    setInputText("");
  };

  const handleUpdate = async (data: ChatFormData) => {
    await updateChat.mutateAsync({
      chatId,
      title: data.title,
      agentSetup: data.agentSetup,
      config: data.config,
    });
    await chatQuery.refetch();
    setEditOpen(false);
  };

  const handleDelete = async () => {
    await deleteChatMutation.mutateAsync({ chatId });
    router.push("/dashboard");
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
              onClick={() => setEditOpen(true)}
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setClearOpen(true)}
            >
              <Eraser className="h-4 w-4" />
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
        {connectionStatus !== "connected" && (
          <div
            className={`px-4 py-2 text-sm flex items-center gap-2 border-b
            ${
              connectionStatus === "disconnected"
                ? "bg-destructive/10 text-destructive"
                : "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
            }`}
          >
            {(connectionStatus === "reconnecting" ||
              connectionStatus === "connecting") && (
              <span className="inline-block h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
            )}
            {connectionStatus === "disconnected"
              ? "Connection lost. Reload to try again."
              : connectionStatus === "reconnecting"
                ? "Connection lost · Reconnecting..."
                : "Connecting..."}
          </div>
        )}
        <ChatMessages messages={messages} isThinking={isThinking} />
        <CardContent className="p-4 border-t flex gap-2">
          <Input
            placeholder="Type your message..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
          />
          <Button onClick={handleSend} disabled={!isConnected || isThinking}>
            <Send className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>

      <ChatFormDialog
        mode="edit"
        open={editOpen}
        onOpenChange={setEditOpen}
        onSubmit={handleUpdate}
        agents={agentsQuery.data ?? []}
        agentsLoading={agentsQuery.isLoading}
        isPending={updateChat.isPending}
        initialData={editInitialData}
      />

      <Dialog open={clearOpen} onOpenChange={setClearOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear chat history</DialogTitle>
            <DialogDescription>
              Are you sure you want to clear all message history for &quot;
              {chatTitle}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                await clearHistoryMutation.mutateAsync({ chatId });
                setClearOpen(false);
              }}
              disabled={clearHistoryMutation.isPending}
            >
              {clearHistoryMutation.isPending ? "Clearing..." : "Clear history"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete chat</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{chatTitle}&quot;? This
              action cannot be undone and all message history will be
              permanently removed.
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
