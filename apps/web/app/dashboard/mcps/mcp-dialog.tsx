"use client";

import { Loader2 } from "lucide-react";
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

interface McpDialogProps {
  dialogStep: "form" | "tools";
  editingServer: McpServer | null;
  form: { name: string; url: string; secretId: string };
  formError: string | null;
  onContinue: () => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
  open: boolean;
  previewedTools: PreviewedTool[];
  previewToolsLoading: boolean;
  secretsData:
    | Array<{ id: string; name: string; namespace: string }>
    | undefined;
  selectedTools: Set<string>;
  setDialogStep: (step: "form" | "tools") => void;
  setForm: (form: { name: string; url: string; secretId: string }) => void;
  setSelectedTools: (tools: Set<string>) => void;
}

export function McpDialog({
  open,
  onOpenChange,
  editingServer,
  dialogStep,
  setDialogStep,
  form,
  setForm,
  formError,
  previewedTools,
  selectedTools,
  setSelectedTools,
  secretsData,
  previewToolsLoading,
  onContinue,
  onSubmit,
}: McpDialogProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className={editingServer ? "max-w-2xl" : "max-w-lg"}>
        {editingServer ? (
          // Edit mode: form + tools in one pane
          <>
            <DialogHeader>
              <DialogTitle>Edit MCP Server</DialogTitle>
              <DialogDescription>
                Update the server configuration and select enabled tools.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="mcp-name">Name</Label>
                  <Input
                    id="mcp-name"
                    onChange={(event) =>
                      setForm({ ...form, name: event.target.value })
                    }
                    value={form.name}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="mcp-url">Server URL</Label>
                  <Input
                    id="mcp-url"
                    onChange={(event) =>
                      setForm({ ...form, url: event.target.value })
                    }
                    value={form.url}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="mcp-secret">Secret</Label>
                <select
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  id="mcp-secret"
                  onChange={(event) =>
                    setForm({ ...form, secretId: event.target.value })
                  }
                  value={form.secretId}
                >
                  <option value="">Select a secret</option>
                  {secretsData?.map((secret) => (
                    <option key={secret.id} value={secret.id}>
                      {secret.name} ({secret.namespace})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-2">
                <Label>Select Tools</Label>
                <div className="grid max-h-64 gap-2 overflow-y-auto rounded-md border p-3">
                  {previewedTools.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      No tools available.
                    </p>
                  ) : (
                    previewedTools.map((tool) => (
                      <div className="flex items-start gap-2" key={tool.name}>
                        <input
                          checked={selectedTools.has(tool.name)}
                          className="mt-1"
                          id={`edit-${tool.name}`}
                          onChange={(e) => {
                            const newSelected = new Set(selectedTools);
                            if (e.target.checked) {
                              newSelected.add(tool.name);
                            } else {
                              newSelected.delete(tool.name);
                            }
                            setSelectedTools(newSelected);
                          }}
                          type="checkbox"
                        />
                        <div className="min-w-0 flex-1">
                          <Label
                            className="cursor-pointer"
                            htmlFor={`edit-${tool.name}`}
                          >
                            {tool.name}
                          </Label>
                          {tool.description && (
                            <p className="line-clamp-2 text-muted-foreground text-xs">
                              {tool.description}
                            </p>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {formError && (
                <p className="text-destructive text-sm">{formError}</p>
              )}
            </div>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)} variant="outline">
                Cancel
              </Button>
              <Button onClick={onSubmit}>Update MCP</Button>
            </DialogFooter>
          </>
        ) : dialogStep === "form" ? (
          // Add mode: form only
          <>
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
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                  value={form.name}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="mcp-url">Server URL</Label>
                <Input
                  id="mcp-url"
                  onChange={(event) =>
                    setForm({ ...form, url: event.target.value })
                  }
                  value={form.url}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="mcp-secret">Secret</Label>
                <select
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  id="mcp-secret"
                  onChange={(event) =>
                    setForm({ ...form, secretId: event.target.value })
                  }
                  value={form.secretId}
                >
                  <option value="">Select a secret</option>
                  {secretsData?.map((secret) => (
                    <option key={secret.id} value={secret.id}>
                      {secret.name} ({secret.namespace})
                    </option>
                  ))}
                </select>
                {secretsData?.length === 0 && (
                  <p className="text-muted-foreground text-xs">
                    No secrets available yet. Create one in Secrets.
                  </p>
                )}
              </div>
              {formError && (
                <p className="text-destructive text-sm">{formError}</p>
              )}
            </div>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)} variant="outline">
                Cancel
              </Button>
              <Button onClick={onContinue}>
                {previewToolsLoading && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Continue
              </Button>
            </DialogFooter>
          </>
        ) : (
          // Add mode: tools selection
          <>
            <DialogHeader>
              <DialogTitle>Select Tools</DialogTitle>
              <DialogDescription>
                Choose which tools from this MCP server to enable.
              </DialogDescription>
            </DialogHeader>
            <div className="grid max-h-96 gap-3 overflow-y-auto">
              {previewedTools.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No tools available.
                </p>
              ) : (
                previewedTools.map((tool) => (
                  <div className="flex items-start gap-2" key={tool.name}>
                    <input
                      checked={selectedTools.has(tool.name)}
                      className="mt-1"
                      id={tool.name}
                      onChange={(e) => {
                        const newSelected = new Set(selectedTools);
                        if (e.target.checked) {
                          newSelected.add(tool.name);
                        } else {
                          newSelected.delete(tool.name);
                        }
                        setSelectedTools(newSelected);
                      }}
                      type="checkbox"
                    />
                    <div className="min-w-0 flex-1">
                      <Label className="cursor-pointer" htmlFor={tool.name}>
                        {tool.name}
                      </Label>
                      {tool.description && (
                        <p className="line-clamp-2 text-muted-foreground text-xs">
                          {tool.description}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
            <DialogFooter>
              <Button
                onClick={() => {
                  setDialogStep("form");
                }}
                variant="outline"
              >
                Back
              </Button>
              <Button onClick={onSubmit}>Create MCP</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
