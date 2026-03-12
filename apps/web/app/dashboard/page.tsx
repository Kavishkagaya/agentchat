"use client";

import { useState } from "react";
import { buildDefaultSystemPrompt } from "@axon/shared";
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
type AgentSetupDraft = { nickname: string; responsibility: string };

function buildNicknameSeed(agentName: string, agentId: string): string {
  const cleaned = agentName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_");
  if (cleaned.length >= 2) return cleaned.slice(0, 24);
  return `agent_${agentId.replace(/[^a-z0-9]/gi, "").slice(-6).toLowerCase()}`;
}

export default function DashboardPage() {
  const router = useRouter();
  const chatsQuery = api.chats.list.useQuery();
  const agentsQuery = api.agents.list.useQuery();
  const createChat = api.chats.create.useMutation();
  const deleteChatMutation = api.chats.delete.useMutation();

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [createStep, setCreateStep] = useState<1 | 2>(1);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    agentIds: [] as string[],
    agentSetup: {} as Record<string, AgentSetupDraft>,
    auto: true,
    defaultAgentId: "",
    systemPrompt: "",
  });

  const selectedAgentSetup = form.agentIds
    .map((agentId) => ({
      agentId,
      nickname: form.agentSetup[agentId]?.nickname?.trim() ?? "",
      responsibility: form.agentSetup[agentId]?.responsibility?.trim() ?? "",
    }))
    .filter((entry) => entry.agentId.length > 0);

  const isStepOneValid =
    form.title.trim().length > 0 &&
    selectedAgentSetup.length > 0 &&
    selectedAgentSetup.every(
      (entry) => entry.nickname.length >= 2 && entry.responsibility.length >= 3
    ) &&
    (!form.auto || (form.defaultAgentId.length > 0 && form.agentIds.includes(form.defaultAgentId)));
  const isStepTwoValid = isStepOneValid && form.systemPrompt.trim().length > 0;

  const handleCreate = async () => {
    if (!isStepTwoValid) return;
    const result = await createChat.mutateAsync({
      title: form.title,
      agentSetup: selectedAgentSetup,
      config: {
        auto: form.auto,
        default_agent: form.auto ? form.defaultAgentId : undefined,
        system_prompt: form.systemPrompt.trim(),
      },
    });
    setCreateOpen(false);
    setCreateStep(1);
    setFormError(null);
    setForm({
      title: "",
      agentIds: [],
      agentSetup: {},
      auto: true,
      defaultAgentId: "",
      systemPrompt: "",
    });
    router.push(`/dashboard/chats/${result.chatId}`);
  };

  const moveToPromptStep = () => {
    if (!isStepOneValid) {
      setFormError("Complete all required fields before continuing.");
      return;
    }
    setFormError(null);
    setForm((prev) => ({
      ...prev,
      systemPrompt:
        prev.systemPrompt.trim().length > 0
          ? prev.systemPrompt
          : buildDefaultSystemPrompt(selectedAgentSetup),
    }));
    setCreateStep(2);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteChatMutation.mutateAsync({ chatId: deleteTarget.id });
    setDeleteTarget(null);
    await chatsQuery.refetch();
  };

  const toggleAgent = (agentId: string) => {
    const agentName =
      agentsQuery.data?.find((agent: AgentItem) => agent.id === agentId)?.name ?? agentId;
    setForm((prev) => ({
      ...prev,
      agentSetup: prev.agentIds.includes(agentId)
        ? Object.fromEntries(
            Object.entries(prev.agentSetup).filter(([key]) => key !== agentId)
          )
        : {
            ...prev.agentSetup,
            [agentId]: prev.agentSetup[agentId] ?? {
              nickname: buildNicknameSeed(agentName, agentId),
              responsibility: "",
            },
          },
      defaultAgentId:
        prev.defaultAgentId === agentId && prev.agentIds.includes(agentId)
          ? ""
          : prev.defaultAgentId,
      agentIds: prev.agentIds.includes(agentId)
        ? prev.agentIds.filter((id) => id !== agentId)
        : [...prev.agentIds, agentId],
    }));
  };

  const setAgentSetupField = (
    agentId: string,
    field: keyof AgentSetupDraft,
    value: string
  ) => {
    setForm((prev) => ({
      ...prev,
      agentSetup: {
        ...prev.agentSetup,
        [agentId]: {
          nickname: prev.agentSetup[agentId]?.nickname ?? "",
          responsibility: prev.agentSetup[agentId]?.responsibility ?? "",
          [field]: value,
        },
      },
    }));
  };

  const resetCreateDialog = (open: boolean) => {
    setCreateOpen(open);
    if (!open) {
      setCreateStep(1);
      setFormError(null);
      setForm({
        title: "",
        agentIds: [],
        agentSetup: {},
        auto: true,
        defaultAgentId: "",
        systemPrompt: "",
      });
    }
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
      <Dialog open={createOpen} onOpenChange={resetCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Chat</DialogTitle>
            <DialogDescription>
              Step {createStep} of 2:{" "}
              {createStep === 1
                ? "team setup and routing defaults"
                : "review and edit generated system prompt"}
            </DialogDescription>
          </DialogHeader>
          {createStep === 1 ? (
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

              {form.agentIds.length > 0 && (
                <div className="grid gap-3 rounded-md border p-3">
                  <Label>Agent Metadata (required)</Label>
                  {form.agentIds.map((agentId) => {
                    const agentName =
                      agentsQuery.data?.find((agent: AgentItem) => agent.id === agentId)?.name ??
                      agentId;
                    return (
                      <div key={agentId} className="grid gap-2 rounded border p-2">
                        <div className="text-sm font-medium">{agentName}</div>
                        <Input
                          placeholder="Nickname (e.g. planner)"
                          value={form.agentSetup[agentId]?.nickname ?? ""}
                          onChange={(e) =>
                            setAgentSetupField(agentId, "nickname", e.target.value)
                          }
                        />
                        <Input
                          placeholder="Responsibility (e.g. planning and sequencing work)"
                          value={form.agentSetup[agentId]?.responsibility ?? ""}
                          onChange={(e) =>
                            setAgentSetupField(agentId, "responsibility", e.target.value)
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="grid gap-2 rounded-md border p-3">
                <Label className="text-sm font-medium">Routing Defaults</Label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.auto}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        auto: e.target.checked,
                        defaultAgentId: e.target.checked ? prev.defaultAgentId : "",
                      }))
                    }
                  />
                  Auto route messages when no mention exists
                </label>

                {form.auto && (
                  <div className="grid gap-2">
                    <Label htmlFor="default-agent">Default Agent</Label>
                    <select
                      id="default-agent"
                      className="h-10 rounded-md border bg-background px-3 text-sm"
                      value={form.defaultAgentId}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, defaultAgentId: e.target.value }))
                      }
                    >
                      <option value="">Select default agent</option>
                      {form.agentIds.map((agentId) => {
                        const agentName =
                          agentsQuery.data?.find((agent: AgentItem) => agent.id === agentId)
                            ?.name ?? agentId;
                        return (
                          <option key={agentId} value={agentId}>
                            {agentName}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                )}
              </div>

              {formError && (
                <p className="text-sm text-destructive">{formError}</p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-md border p-3">
                <p className="text-sm text-muted-foreground">
                  This prompt is auto-generated from selected agents, nicknames, and
                  responsibilities. Edit before creating the chat.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="chat-system-prompt">System Prompt</Label>
                <textarea
                  id="chat-system-prompt"
                  className="min-h-56 rounded-md border bg-background p-3 text-sm"
                  value={form.systemPrompt}
                  onChange={(e) => setForm((prev) => ({ ...prev, systemPrompt: e.target.value }))}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => resetCreateDialog(false)}>
              Cancel
            </Button>
            {createStep === 1 ? (
              <Button onClick={moveToPromptStep} disabled={!isStepOneValid}>
                Next
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => setCreateStep(1)}
                  disabled={createChat.isPending}
                >
                  Back
                </Button>
                <Button onClick={handleCreate} disabled={!isStepTwoValid || createChat.isPending}>
                  {createChat.isPending ? "Creating..." : "Create"}
                </Button>
              </>
            )}
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
