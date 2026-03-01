"use client";

import { Edit2, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
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

export default function McpsPage() {
  const utils = api.useUtils();
  const {
    data: mcpServers,
    isLoading: mcpLoading,
    error: mcpError,
  } = api.mcp.list.useQuery();
  const { mutateAsync: deleteMcp, isPending: deleteMcpLoading } =
    api.mcp.delete.useMutation();

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedServer, setSelectedServer] = useState<McpServer | null>(null);

  const getStatusClassName = (status: string): string => {
    switch (status) {
      case "valid":
        return "bg-green-100 text-green-800";
      case "error":
        return "bg-red-100 text-red-800";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const handleOpenAdd = () => {
    setSelectedServer(null);
    setDialogOpen(true);
  };

  const handleEdit = (server: McpServer) => {
    setSelectedServer(server);
    setDialogOpen(true);
  };

  const handleDelete = async (serverId: string) => {
    toast("Delete MCP Server?", {
      description: "This action cannot be undone.",
      action: {
        label: "Delete",
        onClick: async () => {
          try {
            await deleteMcp({ serverId });
            await utils.mcp.list.invalidate();
            toast.success("MCP server deleted successfully");
          } catch (error) {
            toast.error(
              error instanceof Error ? error.message : "Failed to delete MCP server"
            );
          }
        },
      },
      cancel: {
        label: "Cancel",
        onClick: () => {
          // Toast closes automatically
        },
      },
    });
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
        <Button onClick={handleOpenAdd}>Add MCP</Button>
      </div>

      {mcpError && (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
          <p className="font-medium text-destructive text-sm">
            Failed to load MCP servers
          </p>
          <p className="mt-1 text-destructive/80 text-xs">
            {mcpError instanceof Error ? mcpError.message : "Unknown error"}
          </p>
        </div>
      )}

      {mcpLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton className="h-[140px] w-full rounded-xl" key={i} />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {mcpServers?.map((server) => (
            <Card key={server.id}>
              <CardHeader className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-lg">{server.name}</CardTitle>
                  <span
                    className={`rounded-full px-2 py-1 font-medium text-xs ${getStatusClassName(server.status)}`}
                  >
                    {server.status}
                  </span>
                </div>
                <CardDescription>{server.url}</CardDescription>
                {server.errorMessage && (
                  <p className="font-medium text-destructive text-xs">
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
                    disabled={deleteMcpLoading}
                    onClick={() => handleDelete(server.id)}
                    size="sm"
                    variant="outline"
                  >
                    {deleteMcpLoading ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </CardHeader>
            </Card>
          ))}
          {mcpServers?.length === 0 && (
            <div className="col-span-full rounded-xl border-2 border-dashed py-12 text-center text-muted-foreground">
              No MCP servers yet. Click "Add MCP" to create one.
            </div>
          )}
        </div>
      )}

      <McpDialog
        initialServer={selectedServer}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setSelectedServer(null);
          }
        }}
        onSuccess={async () => {
          await utils.mcp.list.invalidate();
        }}
        open={dialogOpen}
      />
    </div>
  );
}
