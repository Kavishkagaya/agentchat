"use client";

import { useState, useEffect } from "react";
import type { ChatAgentSetup } from "@axon/shared";
import { Button } from "@/components/ui/button";
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type AgentItem = { id: string; name: string };
type AgentSetupDraft = { nickname: string; responsibility: string };

export type ChatFormData = {
  title: string;
  agentSetup: ChatAgentSetup[];
  config: {
    auto?: boolean;
    default_agent?: string;
    trigger_depth_limit?: number;
    history_mode?: "internal" | "external";
    compaction_threshold?: number;
  };
};

export type ChatFormInitialData = {
  title: string;
  agentSetups: ChatAgentSetup[];
  config?: {
    auto?: boolean;
    default_agent?: string;
    trigger_depth_limit?: number;
    history_mode?: "internal" | "external";
    compaction_threshold?: number;
  };
};

type ChatFormDialogProps = {
  mode: "create" | "edit";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: ChatFormData) => Promise<void>;
  agents: AgentItem[];
  agentsLoading?: boolean;
  isPending?: boolean;
  initialData?: ChatFormInitialData;
};

function buildNicknameSeed(agentName: string, agentId: string): string {
  const cleaned = agentName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_");
  if (cleaned.length >= 2) return cleaned.slice(0, 24);
  return `agent_${agentId.replace(/[^a-z0-9]/gi, "").slice(-6).toLowerCase()}`;
}

type FormState = {
  title: string;
  agentIds: string[];
  agentSetup: Record<string, AgentSetupDraft>;
  auto: boolean;
  defaultAgentId: string;
  triggerDepthLimit: number;
  historyMode: "internal" | "external";
  compactionThreshold: number;
};

const DEFAULT_FORM: FormState = {
  title: "",
  agentIds: [],
  agentSetup: {},
  auto: true,
  defaultAgentId: "",
  triggerDepthLimit: 10,
  historyMode: "internal",
  compactionThreshold: 50000,
};

function buildFormFromInitial(data: ChatFormInitialData): FormState {
  const agentIds = data.agentSetups.map((a) => a.agentId);
  const agentSetup: Record<string, AgentSetupDraft> = {};
  for (const setup of data.agentSetups) {
    agentSetup[setup.agentId] = {
      nickname: setup.nickname,
      responsibility: setup.responsibility,
    };
  }
  return {
    title: data.title,
    agentIds,
    agentSetup,
    auto: data.config?.auto ?? true,
    defaultAgentId: data.config?.default_agent ?? "",
    triggerDepthLimit: data.config?.trigger_depth_limit ?? 10,
    historyMode: data.config?.history_mode ?? "internal",
    compactionThreshold: data.config?.compaction_threshold ?? 50000,
  };
}

export function ChatFormDialog({
  mode,
  open,
  onOpenChange,
  onSubmit,
  agents,
  agentsLoading,
  isPending,
  initialData,
}: ChatFormDialogProps) {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(initialData ? buildFormFromInitial(initialData) : DEFAULT_FORM);
      setFormError(null);
    }
  }, [open, initialData]);

  const selectedAgentSetup: ChatAgentSetup[] = form.agentIds
    .map((agentId) => ({
      agentId,
      nickname: form.agentSetup[agentId]?.nickname?.trim() ?? "",
      responsibility: form.agentSetup[agentId]?.responsibility?.trim() ?? "",
    }))
    .filter((entry) => entry.agentId.length > 0);

  const isValid =
    form.title.trim().length > 0 &&
    selectedAgentSetup.length > 0 &&
    selectedAgentSetup.every(
      (entry) => entry.nickname.length >= 2 && entry.responsibility.length >= 3
    );

  const toggleAgent = (agentId: string) => {
    const agentName =
      agents.find((a) => a.id === agentId)?.name ?? agentId;
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

  const handleSubmit = async () => {
    if (!isValid) {
      setFormError("Complete all required fields in the Team tab.");
      return;
    }
    setFormError(null);

    await onSubmit({
      title: form.title,
      agentSetup: selectedAgentSetup,
      config: {
        auto: form.auto,
        default_agent: form.defaultAgentId || undefined,
        trigger_depth_limit: form.triggerDepthLimit,
        history_mode: form.historyMode,
        compaction_threshold: form.compactionThreshold,
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "New Chat" : "Edit Chat"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Set up your team and routing configuration."
              : "Update chat settings and routing configuration."}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="team" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="team">Team</TabsTrigger>
            <TabsTrigger value="routing">Routing</TabsTrigger>
          </TabsList>

          {/* Tab 1: Team */}
          <TabsContent value="team" className="flex-1 overflow-y-auto space-y-4 pr-1">
            <div className="grid gap-2">
              <Label htmlFor="chat-title">Title</Label>
              <Input
                id="chat-title"
                placeholder="My chat"
                value={form.title}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, title: e.target.value }))
                }
              />
            </div>

            <div className="grid gap-2">
              <Label>Agents</Label>
              {agentsLoading ? (
                <p className="text-sm text-muted-foreground">Loading agents...</p>
              ) : agents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No agents available.</p>
              ) : (
                <div className="grid gap-2 max-h-36 overflow-y-auto">
                  {agents.map((agent) => (
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
                <Label>Agent Setup (required)</Label>
                {form.agentIds.map((agentId) => {
                  const agentName =
                    agents.find((a) => a.id === agentId)?.name ?? agentId;
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
          </TabsContent>

          {/* Tab 2: Routing */}
          <TabsContent value="routing" className="flex-1 overflow-y-auto space-y-4 pr-1">
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label className="text-sm font-medium">Routing Mode</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {form.auto
                    ? "Auto — agents can mention and trigger each other"
                    : "Manual — only users can trigger agents via @mentions"}
                </p>
              </div>
              <Switch
                checked={form.auto}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({
                    ...prev,
                    auto: checked,
                    defaultAgentId: checked ? prev.defaultAgentId : "",
                  }))
                }
              />
            </div>

            {form.auto && (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="default-agent">
                    Coordinator Agent{" "}
                    <span className="text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Fallback agent when no @mention is detected. Not required if agents mention each other.
                  </p>
                  <select
                    id="default-agent"
                    className="h-10 rounded-md border bg-background px-3 text-sm"
                    value={form.defaultAgentId}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        defaultAgentId: e.target.value,
                      }))
                    }
                  >
                    <option value="">None</option>
                    {form.agentIds.map((agentId) => {
                      const agentName =
                        agents.find((a) => a.id === agentId)?.name ?? agentId;
                      return (
                        <option key={agentId} value={agentId}>
                          {agentName}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="trigger-depth">Trigger Depth Limit</Label>
                  <p className="text-xs text-muted-foreground">
                    Max agent-to-agent trigger chain length before stopping. Higher values allow longer autonomous conversations.
                  </p>
                  <Input
                    id="trigger-depth"
                    type="number"
                    min={1}
                    max={100}
                    value={form.triggerDepthLimit}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        triggerDepthLimit: Math.max(
                          1,
                          Math.min(100, parseInt(e.target.value) || 1)
                        ),
                      }))
                    }
                  />
                </div>
              </>
            )}

            <div className="grid gap-2">
              <Label htmlFor="history-mode">History Mode</Label>
              <p className="text-xs text-muted-foreground">
                Internal stores message history. External is for integrations (e.g. Slack) where history lives elsewhere.
              </p>
              <select
                id="history-mode"
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={form.historyMode}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    historyMode: e.target.value as "internal" | "external",
                  }))
                }
              >
                <option value="internal">Internal</option>
                <option value="external">External</option>
              </select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="compaction-threshold">Context Limit (tokens)</Label>
              <p className="text-xs text-muted-foreground">
                Token count before context compaction triggers.
              </p>
              <Input
                id="compaction-threshold"
                type="number"
                min={1000}
                max={200000}
                value={form.compactionThreshold}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    compactionThreshold: Math.max(
                      1000,
                      Math.min(200000, parseInt(e.target.value) || 50000)
                    ),
                  }))
                }
              />
            </div>
          </TabsContent>
        </Tabs>

        {formError && (
          <p className="text-sm text-destructive">{formError}</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || isPending}>
            {isPending
              ? mode === "create"
                ? "Creating..."
                : "Saving..."
              : mode === "create"
                ? "Create"
                : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
