"use client";

import { Edit2, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ModelRow = {
  id: string;
  kind: string;
  modelId: string;
  name: string;
  secretRef?: string | null;
};

type CatalogModel = {
  kind: string;
  label: string;
  models: string[];
};

const EMPTY_FORM = {
  name: "",
  providerKind: "",
  modelId: "",
  secretRef: "",
  customSlug: "",
  customBaseUrl: "",
};

type ModelForm = typeof EMPTY_FORM;

function getModelLabel(kind: string, models: CatalogModel[]): string {
  if (kind.startsWith("custom-")) {
    return "Custom";
  }
  const model = models.find((p) => p.kind === kind);
  return model?.label ?? kind;
}

function buildModelConfig(form: ModelForm) {
  const config = {
    model_type: "cloudflare_ai_gateway",
    kind: form.customSlug ? `custom-${form.customSlug}` : form.providerKind,
    model_id: form.modelId,
    credentials_ref: {
      secret_id: form.secretRef,
      version: "latest",
    },
    enabled: true,
  };

  // Store custom base URL if provided
  if (form.customSlug && form.customBaseUrl) {
    (config as Record<string, unknown>).custom_base_url = form.customBaseUrl;
  }

  return config;
}

export default function ModelsPage() {
  const catalogQuery = api.models.getCatalog.useQuery();
  const modelsQuery = api.models.list.useQuery();
  const secretsQuery = api.secrets.list.useQuery();
  const createModel = api.models.create.useMutation();
  const updateModel = api.models.update.useMutation();
  const deleteModel = api.models.delete.useMutation();

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<ModelForm>({ ...EMPTY_FORM });
  const [editingModel, setEditingModel] = useState<ModelRow | null>(
    null
  );
  const [formError, setFormError] = useState<string | null>(null);

  const catalog =
    (catalogQuery.data as { models: CatalogModel[] } | undefined)
      ?.models ?? [];
  const selectedModel = useMemo(
    () => catalog.find((p) => p.kind === form.providerKind),
    [catalog, form.providerKind]
  );

  const resetForm = () => {
    setForm({ ...EMPTY_FORM });
    setFormError(null);
  };

  const handleCreate = async () => {
    setFormError(null);
    if (!(form.name && form.providerKind && form.modelId && form.secretRef)) {
      setFormError("Name, model provider, model, and API key are required.");
      return;
    }

    try {
      await createModel.mutateAsync({
        name: form.name,
        config: buildModelConfig(form),
      });
      await modelsQuery.refetch();
      setCreateOpen(false);
      resetForm();
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Failed to create model"
      );
    }
  };

  const handleEdit = async () => {
    if (!editingModel) {
      return;
    }
    setFormError(null);
    if (!(form.name && form.providerKind && form.modelId)) {
      setFormError("Name, model provider, and model are required.");
      return;
    }

    try {
      await updateModel.mutateAsync({
        id: editingModel.id,
        name: form.name,
        config: buildModelConfig(form),
      });
      await modelsQuery.refetch();
      setEditOpen(false);
      setEditingModel(null);
      resetForm();
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Failed to update model"
      );
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteModel.mutateAsync({ id });
      await modelsQuery.refetch();
    } catch (error) {
      console.error("Failed to delete model:", error);
    }
  };

  const openEdit = (model: ModelRow) => {
    setEditingModel(model);
    const kind = model.kind;
    let providerKind = kind;
    let customSlug = "";
    if (kind.startsWith("custom-")) {
      providerKind = "custom";
      customSlug = kind.substring(7); // Remove "custom-" prefix
    }
    setForm({
      name: model.name,
      providerKind,
      modelId: model.modelId,
      secretRef: model.secretRef ?? "",
      customSlug,
      customBaseUrl: "",
    });
    setEditOpen(true);
  };

  const isCustomProvider = form.providerKind === "custom";
  const modelModels = selectedModel?.models ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-bold text-3xl tracking-tight">Models</h1>
          <p className="text-muted-foreground">
            Manage AI model configurations for your organization.
          </p>
        </div>
        <Button
          onClick={() => {
            resetForm();
            setCreateOpen(true);
          }}
        >
          Add Model
        </Button>
      </div>

      {modelsQuery.isLoading ? (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>API Key</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 3 }, (_, i) => (
                <TableRow key={`skeleton-${i}`}>
                  <TableCell>
                    <Skeleton className="h-4 w-32" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-40" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-32" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>API Key</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {modelsQuery.data?.map((model) => {
                const kind = model.kind;
                const modelLabel = getModelLabel(kind, catalog);
                return (
                  <TableRow key={model.id}>
                    <TableCell className="font-medium">
                      {model.name}
                    </TableCell>
                    <TableCell className="text-sm">{modelLabel}</TableCell>
                    <TableCell className="text-sm">
                      {model.modelId}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {model.secretRef ? "•••••" : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          onClick={() => openEdit(model)}
                          size="sm"
                          variant="ghost"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          onClick={() => handleDelete(model.id)}
                          size="sm"
                          variant="ghost"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {modelsQuery.data?.length === 0 && (
            <div className="py-12 text-center text-muted-foreground">
              No models yet.
            </div>
          )}
        </div>
      )}

      <Dialog onOpenChange={setCreateOpen} open={createOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add model</DialogTitle>
            <DialogDescription>
              Configure a model to access AI services through your account.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="provider-name">Name</Label>
              <Input
                id="provider-name"
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                placeholder="e.g., My OpenAI Account"
                value={form.name}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="provider-select">Provider</Label>
              <Select
                onValueChange={(value) =>
                  setForm({ ...form, providerKind: value, modelId: "" })
                }
                value={form.providerKind}
              >
                <SelectTrigger id="provider-select">
                  <SelectValue placeholder="Select a provider" />
                </SelectTrigger>
                <SelectContent>
                  {catalog.map((provider) => (
                    <SelectItem key={provider.kind} value={provider.kind}>
                      {provider.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isCustomProvider ? (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="custom-slug">Custom Provider Slug</Label>
                  <Input
                    className="text-sm"
                    id="custom-slug"
                    onChange={(event) =>
                      setForm({ ...form, customSlug: event.target.value })
                    }
                    placeholder="e.g., my-local-llm"
                    value={form.customSlug}
                  />
                  <p className="text-muted-foreground text-xs">
                    Unique identifier for your custom provider
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="custom-base-url">Base URL (Optional)</Label>
                  <Input
                    className="text-sm"
                    id="custom-base-url"
                    onChange={(event) =>
                      setForm({ ...form, customBaseUrl: event.target.value })
                    }
                    placeholder="e.g., https://ml.internal.example.com"
                    type="url"
                    value={form.customBaseUrl}
                  />
                  <p className="text-muted-foreground text-xs">
                    Endpoint URL for your self-hosted model (optional)
                  </p>
                </div>
              </>
            ) : null}

            {isCustomProvider ? (
              <div className="grid gap-2">
                <Label htmlFor="custom-model">Model Name</Label>
                <Input
                  id="custom-model"
                  onChange={(event) =>
                    setForm({ ...form, modelId: event.target.value })
                  }
                  placeholder="e.g., my-model"
                  value={form.modelId}
                />
              </div>
            ) : form.providerKind ? (
              <div className="grid gap-2">
                <Label htmlFor="model-select">Model</Label>
                <Select
                  onValueChange={(value) =>
                    setForm({ ...form, modelId: value })
                  }
                  value={form.modelId}
                >
                  <SelectTrigger id="model-select">
                    <SelectValue placeholder="Select a model" />
                  </SelectTrigger>
                  <SelectContent>
                    {modelModels.map((model) => (
                      <SelectItem key={model} value={model}>
                        {model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="grid gap-2">
              <Label htmlFor="model-secret">API Key (BYOK)</Label>
              <Select
                onValueChange={(value) =>
                  setForm({ ...form, secretRef: value })
                }
                value={form.secretRef}
              >
                <SelectTrigger id="model-secret">
                  <SelectValue placeholder="Select an API key" />
                </SelectTrigger>
                <SelectContent>
                  {secretsQuery.data?.map((secret) => (
                    <SelectItem key={secret.id} value={secret.id}>
                      {secret.name} ({secret.namespace})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {formError && (
              <p className="text-destructive text-sm">{formError}</p>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setCreateOpen(false)} variant="outline">
              Cancel
            </Button>
            <Button disabled={createModel.isPending} onClick={handleCreate}>
              Create model
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={setEditOpen} open={editOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit model</DialogTitle>
            <DialogDescription>
              Update model configuration and settings.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="provider-edit-name">Name</Label>
              <Input
                id="provider-edit-name"
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                value={form.name}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="provider-edit-select">Provider</Label>
              <Select
                onValueChange={(value) =>
                  setForm({ ...form, providerKind: value, modelId: "" })
                }
                value={form.providerKind}
              >
                <SelectTrigger id="provider-edit-select">
                  <SelectValue placeholder="Select a provider" />
                </SelectTrigger>
                <SelectContent>
                  {catalog.map((provider) => (
                    <SelectItem key={provider.kind} value={provider.kind}>
                      {provider.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isCustomProvider ? (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="custom-slug-edit">Custom Provider Slug</Label>
                  <Input
                    className="text-sm"
                    id="custom-slug-edit"
                    onChange={(event) =>
                      setForm({ ...form, customSlug: event.target.value })
                    }
                    placeholder="e.g., my-local-llm"
                    value={form.customSlug}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="custom-base-url-edit">
                    Base URL (Optional)
                  </Label>
                  <Input
                    className="text-sm"
                    id="custom-base-url-edit"
                    onChange={(event) =>
                      setForm({ ...form, customBaseUrl: event.target.value })
                    }
                    placeholder="e.g., https://ml.internal.example.com"
                    type="url"
                    value={form.customBaseUrl}
                  />
                  <p className="text-muted-foreground text-xs">
                    Endpoint URL for your self-hosted model (optional)
                  </p>
                </div>
              </>
            ) : null}

            {isCustomProvider ? (
              <div className="grid gap-2">
                <Label htmlFor="custom-model-edit">Model Name</Label>
                <Input
                  id="custom-model-edit"
                  onChange={(event) =>
                    setForm({ ...form, modelId: event.target.value })
                  }
                  placeholder="e.g., my-model"
                  value={form.modelId}
                />
              </div>
            ) : form.providerKind ? (
              <div className="grid gap-2">
                <Label htmlFor="model-edit-select">Model</Label>
                <Select
                  onValueChange={(value) =>
                    setForm({ ...form, modelId: value })
                  }
                  value={form.modelId}
                >
                  <SelectTrigger id="model-edit-select">
                    <SelectValue placeholder="Select a model" />
                  </SelectTrigger>
                  <SelectContent>
                    {modelModels.map((model) => (
                      <SelectItem key={model} value={model}>
                        {model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="grid gap-2">
              <Label htmlFor="model-edit-secret">API Key (BYOK)</Label>
              <Select
                onValueChange={(value) =>
                  setForm({ ...form, secretRef: value })
                }
                value={form.secretRef}
              >
                <SelectTrigger id="model-edit-secret">
                  <SelectValue placeholder="Select an API key" />
                </SelectTrigger>
                <SelectContent>
                  {secretsQuery.data?.map((secret) => (
                    <SelectItem key={secret.id} value={secret.id}>
                      {secret.name} ({secret.namespace})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {formError && (
              <p className="text-destructive text-sm">{formError}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                setEditOpen(false);
                setEditingModel(null);
              }}
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={updateModel.isPending} onClick={handleEdit}>
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
