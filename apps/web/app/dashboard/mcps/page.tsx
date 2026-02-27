"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
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

export default function McpsPage() {
  const mcpQuery = api.mcp.list.useQuery();
  const addMcp = api.mcp.add.useMutation();
  const refreshMcp = api.mcp.refresh.useMutation();
  const secretsQuery = api.secrets.list.useQuery();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", url: "", secretRef: "" });

  const handleSubmit = async () => {
    setFormError(null);
    if (!form.name || !form.url || !form.secretRef) {
      setFormError("Name, URL, and secret are required.");
      return;
    }

    await addMcp.mutateAsync({
      name: form.name,
      config: {
        url: form.url,
        auth: {
          type: "bearer",
          credentials_ref: {
            secret_id: form.secretRef,
            version: "latest",
          },
        },
        validation: {
          tools_path: "/tools",
        },
      },
    });

    await mcpQuery.refetch();
    setDialogOpen(false);
    setForm({ name: "", url: "", secretRef: "" });
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
        <Button onClick={() => setDialogOpen(true)}>Add MCP</Button>
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
                  <p className="text-xs text-destructive">
                    {server.errorMessage}
                  </p>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    refreshMcp
                      .mutateAsync({ serverId: server.id })
                      .then(() => mcpQuery.refetch())
                  }
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Refresh Tools
                </Button>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add MCP Server</DialogTitle>
            <DialogDescription>
              We will validate this MCP by fetching its tools list.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="mcp-name">Name</Label>
              <Input
                id="mcp-name"
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="mcp-url">Server URL</Label>
              <Input
                id="mcp-url"
                value={form.url}
                onChange={(event) =>
                  setForm({ ...form, url: event.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="mcp-secret">Secret</Label>
              <select
                id="mcp-secret"
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={form.secretRef}
                onChange={(event) =>
                  setForm({ ...form, secretRef: event.target.value })
                }
              >
                <option value="">Select a secret</option>
                {secretsQuery.data?.map((secret) => (
                  <option key={secret.id} value={secret.id}>
                    {secret.name} ({secret.namespace})
                  </option>
                ))}
              </select>
              {secretsQuery.data?.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No secrets available yet. Create one in Secrets.
                </p>
              )}
            </div>
            {formError && (
              <p className="text-sm text-destructive">{formError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit}>Add MCP</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
