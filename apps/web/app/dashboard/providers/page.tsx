"use client";

import { useState } from "react";
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

const EMPTY_FORM = {
  name: "",
  providerType: "cloudflare_ai_gateway",
  kind: "",
  modelId: "",
  secretRef: "",
  gatewayAccountId: "",
  gatewayId: "",
};

type ProviderForm = typeof EMPTY_FORM;

type ProviderRow = {
  id: string;
  name: string;
  providerType: string;
  kind: string;
  modelId: string;
  secretRef?: string | null;
  gatewayAccountId: string;
  gatewayId: string;
};

export default function ProvidersPage() {
  const providersQuery = api.providers.list.useQuery();
  const secretsQuery = api.secrets.list.useQuery();
  const createProvider = api.providers.create.useMutation();
  const updateProvider = api.providers.update.useMutation();
  const deleteProvider = api.providers.delete.useMutation();

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<ProviderForm>({ ...EMPTY_FORM });
  const [editingProvider, setEditingProvider] = useState<ProviderRow | null>(
    null
  );
  const [formError, setFormError] = useState<string | null>(null);

  const resetForm = () => {
    setForm({ ...EMPTY_FORM });
    setFormError(null);
  };

  const handleCreate = async () => {
    setFormError(null);
    if (
      !form.name ||
      !form.providerType ||
      !form.kind ||
      !form.modelId ||
      !form.secretRef ||
      !form.gatewayAccountId ||
      !form.gatewayId
    ) {
      setFormError("All fields are required.");
      return;
    }

    await createProvider.mutateAsync({
      name: form.name,
      providerType: form.providerType,
      kind: form.kind,
      modelId: form.modelId,
      secretRef: form.secretRef,
      gatewayAccountId: form.gatewayAccountId,
      gatewayId: form.gatewayId,
    });
    await providersQuery.refetch();
    setCreateOpen(false);
    resetForm();
  };

  const handleEdit = async () => {
    if (!editingProvider) {
      return;
    }
    setFormError(null);
    if (!form.name || !form.kind || !form.modelId) {
      setFormError("Name, kind, and model are required.");
      return;
    }

    await updateProvider.mutateAsync({
      providerId: editingProvider.id,
      name: form.name,
      kind: form.kind,
      modelId: form.modelId,
      secretRef: form.secretRef || undefined,
      gatewayAccountId: form.gatewayAccountId || undefined,
      gatewayId: form.gatewayId || undefined,
    });
    await providersQuery.refetch();
    setEditOpen(false);
    setEditingProvider(null);
    resetForm();
  };

  const handleDelete = async (providerId: string) => {
    await deleteProvider.mutateAsync({ providerId });
    await providersQuery.refetch();
  };

  const openEdit = (provider: ProviderRow) => {
    setEditingProvider(provider);
    setForm({
      name: provider.name,
      providerType: provider.providerType,
      kind: provider.kind,
      modelId: provider.modelId,
      secretRef: provider.secretRef ?? "",
      gatewayAccountId: provider.gatewayAccountId,
      gatewayId: provider.gatewayId,
    });
    setEditOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-bold text-3xl tracking-tight">Providers</h1>
          <p className="text-muted-foreground">
            Manage provider catalog entries for your org.
          </p>
        </div>
        <Button
          onClick={() => {
            resetForm();
            setCreateOpen(true);
          }}
        >
          Add Provider
        </Button>
      </div>

      {providersQuery.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton className="h-[160px] w-full rounded-xl" key={i} />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {providersQuery.data?.map((provider) => (
            <Card key={provider.id}>
              <CardHeader className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-lg">{provider.name}</CardTitle>
                    <CardDescription>
                      {provider.providerType} · {provider.kind}/{provider.modelId}
                    </CardDescription>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  Gateway: {provider.gatewayAccountId}/{provider.gatewayId}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openEdit(provider)}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDelete(provider.id)}
                  >
                    Delete
                  </Button>
                </div>
              </CardHeader>
            </Card>
          ))}
          {providersQuery.data?.length === 0 && (
            <div className="col-span-full rounded-xl border-2 border-dashed py-12 text-center text-muted-foreground">
              No providers yet.
            </div>
          )}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add provider</DialogTitle>
            <DialogDescription>
              Configure a provider entry backed by AI Gateway.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="provider-name">Name</Label>
              <Input
                id="provider-name"
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="provider-type">Provider Type</Label>
              <Input id="provider-type" value={form.providerType} disabled />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="provider-kind">Provider Kind</Label>
              <Input
                id="provider-kind"
                value={form.kind}
                onChange={(event) =>
                  setForm({ ...form, kind: event.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="provider-model">Default Model</Label>
              <Input
                id="provider-model"
                value={form.modelId}
                onChange={(event) =>
                  setForm({ ...form, modelId: event.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="provider-secret">Provider Secret</Label>
              <select
                id="provider-secret"
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
            </div>
            <div className="grid gap-2">
              <Label htmlFor="provider-account">Gateway Account ID</Label>
              <Input
                id="provider-account"
                value={form.gatewayAccountId}
                onChange={(event) =>
                  setForm({ ...form, gatewayAccountId: event.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="provider-gateway">Gateway ID</Label>
              <Input
                id="provider-gateway"
                value={form.gatewayId}
                onChange={(event) =>
                  setForm({ ...form, gatewayId: event.target.value })
                }
              />
            </div>
            {formError && (
              <p className="text-sm text-destructive">{formError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate}>Create provider</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit provider</DialogTitle>
            <DialogDescription>
              Update provider metadata and secrets.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="provider-edit-name">Name</Label>
              <Input
                id="provider-edit-name"
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="provider-edit-kind">Provider Kind</Label>
              <Input
                id="provider-edit-kind"
                value={form.kind}
                onChange={(event) =>
                  setForm({ ...form, kind: event.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="provider-edit-model">Default Model</Label>
              <Input
                id="provider-edit-model"
                value={form.modelId}
                onChange={(event) =>
                  setForm({ ...form, modelId: event.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="provider-edit-secret">Provider Secret</Label>
              <select
                id="provider-edit-secret"
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
            </div>
            <div className="grid gap-2">
              <Label htmlFor="provider-edit-account">Gateway Account ID</Label>
              <Input
                id="provider-edit-account"
                value={form.gatewayAccountId}
                onChange={(event) =>
                  setForm({ ...form, gatewayAccountId: event.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="provider-edit-gateway">Gateway ID</Label>
              <Input
                id="provider-edit-gateway"
                value={form.gatewayId}
                onChange={(event) =>
                  setForm({ ...form, gatewayId: event.target.value })
                }
              />
            </div>
            {formError && (
              <p className="text-sm text-destructive">{formError}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditOpen(false);
                setEditingProvider(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleEdit}>Save changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
