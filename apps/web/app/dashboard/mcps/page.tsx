"use client";

import { Edit2, Trash2 } from "lucide-react";
import { useState } from "react";
import { api } from "@/app/trpc/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { McpDialog } from "./mcp-dialog";

type McpServer = {
  id: string;
  name: string;
  url: string;
  status: string;
  errorMessage: string | null | undefined;
  config: unknown;
  secretRef: string | null | undefined;
  lastValidatedAt: Date | null | undefined;
  createdAt: Date;
  updatedAt: Date;
};

type PreviewedTool = {
  name: string;
  description: string | null;
  inputSchema: Record<string, unknown> | null;
};

export default function McpsPage() {
  const mcpQuery = api.mcp.list.useQuery();
  const previewToolsMutation = api.mcp.previewTools.useMutation();
  const addMcp = api.mcp.add.useMutation();
  const updateMcp = api.mcp.update.useMutation();
  const deleteMcp = api.mcp.delete.useMutation();
  const secretsQuery = api.secrets.list.useQuery();

  // Dialog lifecycle
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogStep, setDialogStep] = useState<"form" | "tools">("form");
  const [editingServer, setEditingServer] = useState<McpServer | null>(null);

  // Form state
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", url: "", secretId: "" });

  // Tool preview state
  const [previewedTools, setPreviewedTools] = useState<PreviewedTool[]>([]);
  const [selectedTools, setSelectedTools] = useState<Set<string>>(new Set());

  const resetDialog = () => {
    setEditingServer(null);
    setDialogStep("form");
    setForm({ name: "", url: "", secretId: "" });
    setPreviewedTools([]);
    setSelectedTools(new Set());
    setFormError(null);
  };

  const handleOpenDialog = () => {
    resetDialog();
    setDialogOpen(true);
  };

  const handleEdit = async (server: McpServer) => {
    setEditingServer(server);
    setForm({
      name: server.name,
      url: server.url,
      secretId: server.secretRef || "",
    });

    // Auto-fetch tools for this server
    try {
      const tools = await previewToolsMutation.mutateAsync({
        url: server.url,
        secretId: server.secretRef || "",
      });
      setPreviewedTools(tools);

      // Get enabled tools from config if available
      const config = server.config as Record<string, unknown> | null;
      const maskingConfig = config?.masking as
        | Record<string, unknown>
        | undefined;
      const enabledTools =
        (maskingConfig?.enabledTools as string[] | null | undefined) ?? [];
      setSelectedTools(
        new Set(
          enabledTools.length > 0 ? enabledTools : tools.map((t) => t.name)
        )
      );

      setDialogStep("tools");
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Failed to fetch tools"
      );
      setDialogStep("form");
    }

    setDialogOpen(true);
  };

  const handleDelete = async (serverId: string) => {
    if (!confirm("Are you sure you want to delete this MCP server?")) {
      return;
    }
    await deleteMcp.mutateAsync({ serverId });
    await mcpQuery.refetch();
  };

  const handleContinue = async () => {
    setFormError(null);
    if (!(form.name && form.url && form.secretId)) {
      setFormError("Name, URL, and secret are required.");
      return;
    }

    try {
      const tools = await previewToolsMutation.mutateAsync({
        url: form.url,
        secretId: form.secretId,
      });
      setPreviewedTools(tools);
      setSelectedTools(new Set(tools.map((t) => t.name)));
      setDialogStep("tools");
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Failed to fetch tools"
      );
    }
  };

  const handleSubmit = async () => {
    const enabledTools = Array.from(selectedTools);

    if (editingServer) {
      await updateMcp.mutateAsync({
        serverId: editingServer.id,
        name: form.name,
        url: form.url,
        secretId: form.secretId,
        enabledTools: enabledTools.length > 0 ? enabledTools : null,
      });
    } else {
      await addMcp.mutateAsync({
        name: form.name,
        url: form.url,
        secretId: form.secretId,
        enabledTools: enabledTools.length > 0 ? enabledTools : null,
      });
    }

    await mcpQuery.refetch();
    setDialogOpen(false);
    resetDialog();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-bold text-3xl tracking-tight">MCPs</h1>
          <p className="text-muted-foreground">
            Add and validate MCP servers for your organization.
          </p>
        </div>
        <Button onClick={handleOpenDialog}>Add MCP</Button>
      </div>

      {mcpQuery.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton className="h-[140px] w-full rounded-xl" key={i} />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {mcpQuery.data?.map((server) => (
            <Card key={server.id}>
              <CardHeader className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-lg">{server.name}</CardTitle>
                  <span className="rounded-full bg-muted px-2 py-1 text-xs">
                    {server.status}
                  </span>
                </div>
                <CardDescription>{server.url}</CardDescription>
                {server.errorMessage && (
                  <p className="text-destructive text-xs">
                    {server.errorMessage}
                  </p>
                )}
                <div className="flex gap-2">
                  <Button
                    onClick={() => handleEdit(server)}
                    size="sm"
                    variant="outline"
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    onClick={() => handleDelete(server.id)}
                    size="sm"
                    variant="outline"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
            </Card>
          ))}
          {mcpQuery.data?.length === 0 && (
            <div className="col-span-full rounded-xl border-2 border-dashed py-12 text-center text-muted-foreground">
              No MCP servers yet.
            </div>
          )}
        </div>
      )}

      <McpDialog
        dialogStep={dialogStep}
        editingServer={editingServer}
        form={form}
        formError={formError}
        onContinue={handleContinue}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
        open={dialogOpen}
        previewedTools={previewedTools}
        previewToolsLoading={previewToolsMutation.isPending}
        secretsData={secretsQuery.data}
        selectedTools={selectedTools}
        setDialogStep={setDialogStep}
        setForm={setForm}
        setSelectedTools={setSelectedTools}
      />
    </div>
  );
}
