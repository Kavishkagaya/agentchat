"use client";

import { useState } from "react";
import { api } from "@/app/trpc/client";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
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

type AgentItem = { id: string; name: string };

export default function DashboardPage() {
  const router = useRouter();
  const chatsQuery = api.chats.list.useQuery();
  const agentsQuery = api.agents.list.useQuery();
  const createChat = api.chats.create.useMutation();
  const deleteChatMutation = api.chats.delete.useMutation();

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [form, setForm] = useState({ title: "", agentIds: [] as string[] });

  const handleCreate = async () => {
    if (!form.title.trim()) return;
    const result = await createChat.mutateAsync({
      title: form.title,
      agentIds: form.agentIds,
    });
    setCreateOpen(false);
    setForm({ title: "", agentIds: [] });
    router.push(`/dashboard/chats/${result.chatId}`);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteChatMutation.mutateAsync({ chatId: deleteTarget.id });
    setDeleteTarget(null);
    await chatsQuery.refetch();
  };

  const toggleAgent = (agentId: string) => {
    setForm((prev) => ({
      ...prev,
      agentIds: prev.agentIds.includes(agentId)
        ? prev.agentIds.filter((id) => id !== agentId)
        : [...prev.agentIds, agentId],
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> New Chat
        </Button>
      </div>

      {chatsQuery.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="h-32 animate-pulse bg-muted" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {chatsQuery.data?.map((chat: { id: string; title: string; status: string }) => (
            <Card key={chat.id} className="relative transition-colors hover:bg-muted/50">
              <Link
                href={`/dashboard/chats/${chat.id}`}
                className="block"
              >
                <CardHeader>
                  <CardTitle>{chat.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Status: {chat.status}
                  </p>
                </CardContent>
              </Link>
              <Button
                className="absolute right-3 top-3"
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
          ))}
          {chatsQuery.data?.length === 0 && (
            <div className="col-span-full py-12 text-center text-muted-foreground">
              No chats found. Create one to get started.
            </div>
          )}
        </div>
      )}

      {/* Create Chat Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Chat</DialogTitle>
            <DialogDescription>
              Create a new chat and optionally assign agents.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="chat-title">Title</Label>
              <Input
                id="chat-title"
                placeholder="My chat"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
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
                        form.agentIds.includes(agent.id)
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
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!form.title.trim() || createChat.isPending}
            >
              {createChat.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete chat</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deleteTarget?.title}&quot;? This action
              cannot be undone and all message history will be permanently removed.
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
