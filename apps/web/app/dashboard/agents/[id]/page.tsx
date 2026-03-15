"use client";

import { Trash2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { api } from "@/app/trpc/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Skeleton } from "@/components/ui/skeleton";

type McpServer = {
  id: string;
  name: string;
  url: string;
  status: string;
  errorMessage?: string | null;
};

export default function AgentEditPage() {
  const router = useRouter();
  const params = useParams();
  const agentId = params.id as string;

  const utils = api.useUtils();
  const agentQuery = api.agents.get.useQuery({ agentId });
  const mcpQuery = api.mcp.list.useQuery();
  const modelsQuery = api.models.list.useQuery();
  const updateAgent = api.agents.update.useMutation();
  const deleteAgent = api.agents.delete.useMutation();

  const [form, setForm] = useState({
    name: "",
    description: "",
    systemPrompt: "",
    modelId: "",
  });
  const [selectedServers, setSelectedServers] = useState<McpServer[]>([]);
  const [mcpDialogOpen, setMcpDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize form from agent data
  useMemo(() => {
    if (agentQuery.data && !isInitialized) {
      const agent = agentQuery.data;
      const config = agent.config as any;
      setForm({
        name: agent.name,
        description: agent.description || "",
        systemPrompt: (config?.systemPrompt as string) || "",
        modelId: agent.modelId || "",
      });
      if (config?.mcpServers && Array.isArray(config.mcpServers)) {
        const mcpIds = config.mcpServers;
        const servers = mcpQuery.data?.filter((mcp: any) =>
          mcpIds.includes(mcp.id),
        ) as McpServer[];
        if (servers) {
          setSelectedServers(servers);
        }
      }
      setIsInitialized(true);
    }
  }, [agentQuery.data, isInitialized, mcpQuery.data]);

  const selectedModel = useMemo(
    () => modelsQuery.data?.find((model: any) => model.id === form.modelId),
    [modelsQuery.data, form.modelId],
  );

  const handleUpdate = async () => {
    if (!form.name || !form.systemPrompt || !form.modelId || !selectedModel) {
      return;
    }

    await updateAgent.mutateAsync({
      agentId,
      name: form.name,
      description: form.description || undefined,
      modelId: form.modelId,
      config: {
        systemPrompt: form.systemPrompt,
        model: selectedModel.modelId,
        mcpServers: selectedServers.map((s) => s.id),
      },
    });
    router.push("/dashboard/agents");
  };

  const handleDelete = async () => {
    await deleteAgent.mutateAsync({ agentId });
    utils.agents.get.setData({ agentId }, undefined);
    utils.agents.list.invalidate();
    router.push("/dashboard/agents");
  };

  if (agentQuery.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-1/2 rounded-xl" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (!agentQuery.data) {
    return (
      <div className="space-y-6">
        <h1 className="font-bold text-3xl tracking-tight">Agent not found</h1>
        <Button onClick={() => router.push("/dashboard/agents")}>
          Back to agents
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-bold text-3xl tracking-tight">Edit agent</h1>
        <p className="text-muted-foreground">
          Update the agent system prompt, properties, and MCP tool access.
        </p>
      </div>

      <Card>
        <CardHeader className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="agent-name">Name</Label>
            <Input
              id="agent-name"
              value={form.name}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="agent-description">Description</Label>
            <Input
              id="agent-description"
              value={form.description}
              onChange={(event) =>
                setForm({ ...form, description: event.target.value })
              }
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="agent-prompt">System Prompt</Label>
            <textarea
              id="agent-prompt"
              className="min-h-[140px] rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.systemPrompt}
              onChange={(event) =>
                setForm({ ...form, systemPrompt: event.target.value })
              }
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="agent-model">Model</Label>
              <select
                id="agent-model"
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={form.modelId}
                onChange={(event) =>
                  setForm({ ...form, modelId: event.target.value })
                }
              >
                <option value="">Select a model</option>
                {modelsQuery.data?.map((model: any) => (
                  <option key={model.id} value={model.id} className="font-mono">
                    {model.name} ({model.kind}/{model.modelId})
                  </option>
                ))}
              </select>
              {modelsQuery.data?.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No models available yet. Create one in Models.
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="agent-model-id">Model ID</Label>
              <Input
                id="agent-model-id"
                className="font-mono"
                value={selectedModel?.modelId ?? ""}
                disabled
              />
            </div>
          </div>
        </CardHeader>
      </Card>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-xl">MCP Servers</h2>
            <p className="text-sm text-muted-foreground">
              Select MCP servers to give the agent access to their tools.
            </p>
          </div>
          <Button variant="outline" onClick={() => setMcpDialogOpen(true)}>
            Add MCP
          </Button>
        </div>

        {selectedServers.length > 0 ? (
          <div className="space-y-3">
            {selectedServers.map((server) => (
              <Card key={server.id}>
                <CardHeader className="flex flex-row items-start justify-between space-y-0">
                  <div>
                    <CardTitle className="font-mono">{server.name}</CardTitle>
                    <CardDescription className="font-mono">
                      {server.url}
                    </CardDescription>
                  </div>
                  <Button
                    onClick={() =>
                      setSelectedServers((prev) =>
                        prev.filter((s) => s.id !== server.id),
                      )
                    }
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Remove
                  </Button>
                </CardHeader>
              </Card>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border-2 border-dashed py-10 text-center text-muted-foreground">
            Select an MCP server to add its tools to this agent.
          </div>
        )}
      </section>

      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={() => router.push("/dashboard/agents")}
        >
          Cancel
        </Button>
        <Button onClick={handleUpdate}>Update agent</Button>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          {(agentQuery.data.chatCount ?? 0) > 0 && (
            <p className="text-xs text-muted-foreground">
              Used in {agentQuery.data.chatCount} chat
              {agentQuery.data.chatCount === 1 ? "" : "s"}
            </p>
          )}
          <Button
            variant="destructive"
            onClick={() => setDeleteDialogOpen(true)}
            disabled={(agentQuery.data.chatCount ?? 0) > 0}
          >
            <Trash2 className="mr-1 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      <Dialog open={mcpDialogOpen} onOpenChange={setMcpDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add MCP Server</DialogTitle>
            <DialogDescription>
              Choose one of your org MCPs to add it to this agent.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            {mcpQuery.isLoading ? (
              <Skeleton className="h-[80px] w-full rounded-xl" />
            ) : (
              mcpQuery.data?.map((server: any) => {
                const isAlreadyAdded = selectedServers.some(
                  (s) => s.id === server.id,
                );
                return (
                  <button
                    key={server.id}
                    className={`rounded-md border p-3 text-left transition-colors ${
                      isAlreadyAdded
                        ? "cursor-not-allowed bg-muted opacity-50"
                        : "hover:bg-muted"
                    }`}
                    disabled={isAlreadyAdded}
                    onClick={() => {
                      if (!isAlreadyAdded) {
                        setSelectedServers((prev) => [...prev, server]);
                        setMcpDialogOpen(false);
                      }
                    }}
                    type="button"
                  >
                    <p className="font-medium">{server.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {server.url}
                    </p>
                    {isAlreadyAdded && (
                      <p className="mt-1 text-muted-foreground text-xs">
                        Already added
                      </p>
                    )}
                  </button>
                );
              })
            )}
            {mcpQuery.data?.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No MCPs available yet.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => router.push("/dashboard/mcps")}
            >
              Add new MCP
            </Button>
            <Button onClick={() => setMcpDialogOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete agent</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this agent? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteAgent.isPending}
            >
              {deleteAgent.isPending ? "Deleting…" : "Delete agent"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
