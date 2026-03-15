"use client";

import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/app/trpc/client";
import {
  type ChatFormData,
  ChatFormDialog,
} from "@/components/chat-form-dialog";
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

export default function DashboardPage() {
  const router = useRouter();
  const chatsQuery = api.chats.list.useQuery();
  const agentsQuery = api.agents.list.useQuery();
  const createChat = api.chats.create.useMutation();
  const deleteChatMutation = api.chats.delete.useMutation();

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);

  const handleCreate = async (data: ChatFormData) => {
    const result = await createChat.mutateAsync({
      title: data.title,
      agentSetup: data.agentSetup,
      config: data.config,
    });
    setCreateOpen(false);
    router.push(`/dashboard/chats/${result.chatId}`);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteChatMutation.mutateAsync({ chatId: deleteTarget.id });
    setDeleteTarget(null);
    await chatsQuery.refetch();
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Manage and create agentic conversations
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> New Chat
        </Button>
      </div>

      {chatsQuery.isLoading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="h-40 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {chatsQuery.data?.map(
            (chat: { id: string; title: string; status: string }) => (
              <Card
                key={chat.id}
                className="group cursor-pointer transition-all hover:shadow-lg"
              >
                <Link href={`/dashboard/chats/${chat.id}`} className="block">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg group-hover:text-primary transition-colors line-clamp-2">
                      {chat.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="inline-flex items-center rounded-full border bg-secondary px-3 py-1 text-xs font-semibold gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                      {chat.status}
                    </div>
                  </CardContent>
                </Link>
                <Button
                  className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 transition-opacity"
                  size="icon"
                  variant="ghost"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDeleteTarget({ id: chat.id, title: chat.title });
                  }}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </Card>
            ),
          )}
          {chatsQuery.data?.length === 0 && (
            <div className="col-span-full py-12 text-center text-muted-foreground">
              No chats found. Create one to get started.
            </div>
          )}
        </div>
      )}

      {/* Create Chat Dialog */}
      <ChatFormDialog
        mode="create"
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={handleCreate}
        agents={agentsQuery.data ?? []}
        agentsLoading={agentsQuery.isLoading}
        isPending={createChat.isPending}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete chat</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deleteTarget?.title}&quot;?
              This action cannot be undone and all message history will be
              permanently removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
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
