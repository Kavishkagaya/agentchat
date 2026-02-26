"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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

type ToolRef = {
  serverId: string;
  toolId: string;
  name: string;
};

type McpServer = {
  id: string;
  name: string;
  url: string;
  status: string;
  errorMessage?: string | null;
};

export default function AgentCreatePage() {
  const router = useRouter();
  const mcpQuery = api.mcp.list.useQuery();
  const providersQuery = api.providers.list.useQuery();
  const createAgent = api.agents.create.useMutation();
  const publishAgent = api.agents.publish.useMutation();

  const [form, setForm] = useState({
    name: "",
    description: "",
    systemPrompt: "",
    providerId: "",
  });
  const [selectedTools, setSelectedTools] = useState<ToolRef[]>([]);
  const [selectedServer, setSelectedServer] = useState<McpServer | null>(null);
  const [mcpDialogOpen, setMcpDialogOpen] = useState(false);
  const [publishPrompt, setPublishPrompt] = useState<string | null>(null);

  const toolsQuery = api.mcp.listTools.useQuery(
    { serverId: selectedServer?.id ?? "" },
    { enabled: Boolean(selectedServer?.id) }
  );

  const toolOptions = useMemo(() => toolsQuery.data ?? [], [toolsQuery.data]);
  const selectedProvider = useMemo(
    () => providersQuery.data?.find((provider) => provider.id === form.providerId),
    [providersQuery.data, form.providerId]
  );

  const toggleTool = (tool: ToolRef) => {
    setSelectedTools((prev) => {
      const exists = prev.some(
        (ref) => ref.serverId === tool.serverId && ref.toolId === tool.toolId
      );
      if (exists) {
        return prev.filter(
          (ref) => !(ref.serverId === tool.serverId && ref.toolId === tool.toolId)
        );
      }
      return [...prev, tool];
    });
  };

  const handleCreate = async () => {
    if (!form.name || !form.systemPrompt || !form.providerId || !selectedProvider) {
      return;
    }

    const result = await createAgent.mutateAsync({
      name: form.name,
      description: form.description || undefined,
      providerId: form.providerId,
      config: {
        systemPrompt: form.systemPrompt,
        model: selectedProvider.modelId,
        tools: selectedTools,
      },
    });

    setPublishPrompt(result.agentId);
  };

  const handlePublish = async () => {
    if (!publishPrompt) {
      return;
    }
    await publishAgent.mutateAsync({ agentId: publishPrompt });
    setPublishPrompt(null);
    router.push("/dashboard/agents");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-bold text-3xl tracking-tight">Create agent</h1>
        <p className="text-muted-foreground">
          Define the agent system prompt, properties, and MCP tool access.
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
              <Label htmlFor="agent-provider">Provider</Label>
              <select
                id="agent-provider"
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={form.providerId}
                onChange={(event) =>
                  setForm({ ...form, providerId: event.target.value })
                }
              >
                <option value="">Select a provider</option>
                {providersQuery.data?.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name} ({provider.kind}/{provider.modelId})
                  </option>
                ))}
              </select>
              {providersQuery.data?.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No providers available yet. Create one in Providers.
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="agent-model">Model (from provider)</Label>
              <Input
                id="agent-model"
                value={selectedProvider?.modelId ?? ""}
                disabled
              />
            </div>
          </div>
        </CardHeader>
      </Card>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-xl">MCP Tools</h2>
            <p className="text-sm text-muted-foreground">
              Select an MCP server and choose which tools the agent can use.
            </p>
          </div>
          <Button variant="outline" onClick={() => setMcpDialogOpen(true)}>
            Add MCP
          </Button>
        </div>

        {selectedServer ? (
          <Card>
            <CardHeader className="space-y-2">
              <CardTitle>{selectedServer.name}</CardTitle>
              <CardDescription>{selectedServer.url}</CardDescription>
              <div className="grid gap-2 sm:grid-cols-2">
                {toolsQuery.isLoading ? (
                  <Skeleton className="h-[80px] w-full rounded-xl" />
                ) : toolOptions.length > 0 ? (
                  toolOptions.map((tool) => {
                    const checked = selectedTools.some(
                      (ref) =>
                        ref.serverId === tool.serverId &&
                        ref.toolId === tool.toolId
                    );
                    return (
                      <label
                        key={`${tool.serverId}:${tool.toolId}`}
                        className="flex items-center gap-2 rounded-md border p-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            toggleTool({
                              serverId: tool.serverId,
                              toolId: tool.toolId,
                              name: tool.name,
                            })
                          }
                        />
                        <span>{tool.name}</span>
                      </label>
                    );
                  })
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No tools found for this MCP.
                  </p>
                )}
              </div>
            </CardHeader>
          </Card>
        ) : (
          <div className="rounded-xl border-2 border-dashed py-10 text-center text-muted-foreground">
            Select an MCP server to load tools.
          </div>
        )}
      </section>

      <div className="flex gap-3">
        <Button variant="outline" onClick={() => router.push("/dashboard/agents")}>
          Cancel
        </Button>
        <Button onClick={handleCreate}>Create agent</Button>
      </div>

      <Dialog open={mcpDialogOpen} onOpenChange={setMcpDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Select MCP</DialogTitle>
            <DialogDescription>
              Choose one of your org MCPs, or add a new one.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            {mcpQuery.isLoading ? (
              <Skeleton className="h-[80px] w-full rounded-xl" />
            ) : (
              mcpQuery.data?.map((server) => (
                <button
                  key={server.id}
                  className="rounded-md border p-3 text-left hover:bg-muted"
                  onClick={() => {
                    setSelectedServer(server);
                    setSelectedTools([]);
                    setMcpDialogOpen(false);
                  }}
                >
                  <p className="font-medium">{server.name}</p>
                  <p className="text-xs text-muted-foreground">{server.url}</p>
                </button>
              ))
            )}
            {mcpQuery.data?.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No MCPs available yet.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => router.push("/dashboard/mcps")}>
              Add new MCP
            </Button>
            <Button onClick={() => setMcpDialogOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={publishPrompt !== null} onOpenChange={() => setPublishPrompt(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publish agent?</DialogTitle>
            <DialogDescription>
              Publish this agent to public. Org-specific data will be stripped.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => router.push("/dashboard/agents")}>
              Not now
            </Button>
            <Button onClick={handlePublish}>Publish</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
