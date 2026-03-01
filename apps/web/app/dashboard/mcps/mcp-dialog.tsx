"use client";

import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/app/trpc/client";
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

interface McpServer {
  config: unknown;
  createdAt: Date;
  errorMessage: string | null | undefined;
  id: string;
  lastValidatedAt: Date | null | undefined;
  name: string;
  secretRef: string | null | undefined;
  status: string;
  updatedAt: Date;
  url: string;
}

interface PreviewedTool {
  description: string | null;
  inputSchema: Record<string, unknown> | null;
  name: string;
}

interface McpDialogProps {
  initialServer: McpServer | null;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => Promise<void>;
  open: boolean;
}

function SecretSelect({
  secretRef,
  setSecretRef,
  secretsData,
  secretsError,
  secretsLoading,
  isNewServer,
}: {
  secretRef: string | null;
  setSecretRef: (ref: string | null) => void;
  secretsData:
    | Array<{ id: string; name: string; namespace: string }>
    | undefined;
  secretsError?: unknown;
  secretsLoading: boolean;
  isNewServer: boolean;
}) {
  const hasNoError = !secretsError;
  const hasNoSecrets = secretsData?.length === 0;
  const showNoSecretsMessage = hasNoError && isNewServer && hasNoSecrets;
  const secretsErrorMessage =
    secretsError instanceof Error ? secretsError.message : "Unknown error";

  return (
    <div className="grid gap-2">
      <Label htmlFor="mcp-secret">Secret</Label>
      <select
        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        disabled={secretsLoading}
        id="mcp-secret"
        onChange={(event) => {
          const selectedValue = event.target.value;
          setSecretRef(selectedValue || null);
        }}
        value={secretRef || ""}
      >
        <option value="">
          {secretsLoading ? "Loading secrets..." : "Select a secret"}
        </option>
        {secretsData?.map((secret) => (
          <option key={secret.id} value={secret.id}>
            {secret.name} ({secret.namespace})
          </option>
        ))}
      </select>
      {secretsError != null && (
        <p className="font-medium text-destructive text-xs">
          Failed to load secrets: {secretsErrorMessage}
        </p>
      )}
      {showNoSecretsMessage && (
        <p className="text-muted-foreground text-xs">
          No secrets available yet. Create one in Secrets.
        </p>
      )}
    </div>
  );
}

function ToolsList({
  previewedTools,
  previewToolsLoading,
  connectionError,
}: {
  previewedTools: PreviewedTool[];
  previewToolsLoading: boolean;
  connectionError: string | null;
}) {
  if (connectionError) {
    return (
      <div className="grid gap-2">
        <Label>Connection Status</Label>
        <div className="flex gap-2 rounded-md bg-destructive/10 p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-destructive" />
          <p className="text-destructive text-sm">{connectionError}</p>
        </div>
      </div>
    );
  }

  const toolCount = previewToolsLoading ? 0 : previewedTools.length;

  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-green-600" />
        <Label>Available Tools ({toolCount})</Label>
      </div>
      <div className="grid max-h-48 gap-2 overflow-y-auto rounded-md border p-3">
        {previewToolsLoading && (
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading tools...</span>
          </div>
        )}
        {!previewToolsLoading &&
          previewedTools.length > 0 &&
          previewedTools.map((tool) => (
            <div className="flex items-start gap-2" key={tool.name}>
              <CheckCircle2 className="mt-1 h-4 w-4 flex-shrink-0 text-green-600" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm">{tool.name}</p>
                {tool.description && (
                  <p className="line-clamp-2 text-muted-foreground text-xs">
                    {tool.description}
                  </p>
                )}
              </div>
            </div>
          ))}
        {!previewToolsLoading && previewedTools.length === 0 && (
          <p className="text-muted-foreground text-sm">
            No tools available from this MCP.
          </p>
        )}
      </div>
    </div>
  );
}

export function McpDialog({
  initialServer,
  onOpenChange,
  onSuccess,
  open,
}: McpDialogProps) {
  // Form state
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [secretRef, setSecretRef] = useState<string | null>(null);
  const [tools, setTools] = useState<PreviewedTool[]>([]);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // TRPC calls
  const {
    data: secretsData,
    isLoading: secretsLoading,
    error: secretsError,
  } = api.secrets.list.useQuery();
  const { isPending: previewToolsLoading, mutateAsync: previewTools } =
    api.mcp.previewTools.useMutation();
  const { mutateAsync: addMcp, isPending: addMcpLoading } =
    api.mcp.add.useMutation();
  const { mutateAsync: updateMcp, isPending: updateMcpLoading } =
    api.mcp.update.useMutation();

  const isSubmitting = addMcpLoading || updateMcpLoading;
  const isNewServer = !initialServer?.id;

  // Reset form state when initialServer changes or dialog opens/closes
  useEffect(() => {
    if (open) {
      setName(initialServer?.name ?? "");
      setUrl(initialServer?.url ?? "");
      setSecretRef(initialServer?.secretRef ?? null);
      setTools([]);
      setConnectionError(null);
    }
  }, [initialServer, open]);

  // Auto-fetch tools when editing an existing server with a secretRef
  useEffect(() => {
    if (open && initialServer?.id && initialServer?.secretRef) {
      const fetchTools = async () => {
        try {
          const result = await previewTools({
            url: initialServer.url,
            secretId: initialServer.secretRef,
          });
          setTools(result);
        } catch {
          // Silently ignore auto-fetch errors
        }
      };
      fetchTools().catch(() => {
        // Catch promise rejection
      });
    }
  }, [
    open,
    initialServer?.id,
    initialServer?.secretRef,
    initialServer?.url,
    previewTools,
  ]);

  const handleTestConnection = async () => {
    if (!url.trim()) {
      toast.error("Please enter a server URL");
      return;
    }

    setConnectionError(null);
    try {
      const result = await previewTools({
        url: url.trim(),
        secretId: secretRef ?? null,
      });
      setTools(result);
      if (result.length === 0) {
        toast.warning("No tools found. Check your URL and secret.");
      }
    } catch (error) {
      const msg =
        error instanceof Error
          ? error.message
          : "Failed to connect to MCP server";
      setConnectionError(msg);
      setTools([]);
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("Please enter a server name");
      return;
    }

    if (!url.trim()) {
      toast.error("Please enter a server URL");
      return;
    }

    try {
      if (initialServer?.id) {
        await updateMcp({
          serverId: initialServer.id,
          name: name.trim(),
          url: url.trim(),
          secretId: secretRef,
        });
        toast.success("MCP server updated successfully");
      } else {
        await addMcp({
          name: name.trim(),
          url: url.trim(),
          secretId: secretRef,
        });
        toast.success("MCP server created successfully");
      }
      await onSuccess();
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save MCP server"
      );
    }
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  return (
    <Dialog onOpenChange={handleClose} open={open}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {initialServer?.id ? "Edit MCP Server" : "Add MCP Server"}
          </DialogTitle>
          <DialogDescription>
            {initialServer?.id
              ? "Update the server configuration"
              : "Configure and test your MCP server"}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {/* Form Fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="mcp-name">Name</Label>
              <Input
                id="mcp-name"
                onChange={(event) => setName(event.target.value)}
                value={name}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="mcp-url">Server URL</Label>
              <Input
                id="mcp-url"
                onChange={(event) => setUrl(event.target.value)}
                value={url}
              />
            </div>
          </div>

          {/* Secrets Dropdown */}
          <SecretSelect
            isNewServer={isNewServer}
            secretRef={secretRef}
            secretsData={secretsData}
            secretsError={secretsError}
            secretsLoading={secretsLoading}
            setSecretRef={setSecretRef}
          />

          {/* Test Connection Button */}
          <Button
            className="w-full"
            disabled={!url.trim() || previewToolsLoading}
            onClick={handleTestConnection}
            variant="outline"
          >
            {previewToolsLoading && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {previewToolsLoading ? "Testing..." : "Test Connection"}
          </Button>

          {/* Tools Display */}
          <ToolsList
            connectionError={connectionError}
            previewedTools={tools}
            previewToolsLoading={previewToolsLoading}
          />
        </div>

        <DialogFooter>
          <Button onClick={handleClose} variant="outline">
            Cancel
          </Button>
          <Button
            disabled={isSubmitting || previewToolsLoading}
            onClick={handleSubmit}
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {initialServer?.id ? "Update MCP" : "Create MCP"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
