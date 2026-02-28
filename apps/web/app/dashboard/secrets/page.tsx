"use client";

import { useState } from "react";
import { Eye, EyeOff, Trash2, Edit2 } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type SecretRow = {
  id: string;
  name: string;
  namespace: string;
  version: number;
  createdAt: string | Date;
  rotatedAt?: string | Date | null;
};

const EMPTY_SECRET = {
  name: "",
  namespace: "",
  value: "",
};

type SecretForm = typeof EMPTY_SECRET;

function formatDate(value: string | Date | null | undefined) {
  if (!value) {
    return "—";
  }
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleString();
}

function SecretRow({
  secret,
  onEdit,
  onDelete,
}: {
  secret: SecretRow;
  onEdit: (secret: SecretRow) => void;
  onDelete: (secretId: string) => void;
}) {
  const revealMutation = api.secrets.reveal.useMutation();
  const [revealedValue, setRevealedValue] = useState<string | null>(null);
  const [revealError, setRevealError] = useState<string | null>(null);

  const handleReveal = async () => {
    setRevealError(null);
    try {
      const result = await revealMutation.mutateAsync({ secretId: secret.id });
      setRevealedValue(result.value ?? null);
    } catch (error) {
      setRevealError(error instanceof Error ? error.message : "Failed to reveal secret");
    }
  };

  return (
    <TableRow>
      <TableCell className="font-medium">
        <div>
          <div>{secret.name}</div>
          <div className="text-xs text-muted-foreground">v{secret.version}</div>
        </div>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {secret.namespace}
      </TableCell>
      <TableCell className="text-sm">{formatDate(secret.createdAt)}</TableCell>
      <TableCell className="text-sm">
        {formatDate(secret.rotatedAt ?? null)}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <code className="rounded bg-muted px-2 py-1 text-xs font-mono">
            {revealedValue ? revealedValue : "••••••••••••"}
          </code>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              revealedValue ? setRevealedValue(null) : handleReveal()
            }
          >
            {revealedValue ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </Button>
          {revealError && (
            <span className="text-xs text-destructive">{revealError}</span>
          )}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onEdit(secret)}
          >
            <Edit2 className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onDelete(secret.id)}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export default function SecretsPage() {
  const secretsQuery = api.secrets.list.useQuery();
  const createSecret = api.secrets.create.useMutation();
  const updateSecret = api.secrets.update.useMutation();
  const deleteSecret = api.secrets.delete.useMutation();

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<SecretForm>({ ...EMPTY_SECRET });
  const [editingSecret, setEditingSecret] = useState<SecretRow | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const resetForm = () => {
    setForm({ ...EMPTY_SECRET });
    setFormError(null);
  };

  const handleCreate = async () => {
    setFormError(null);
    if (!form.name || !form.namespace || !form.value) {
      setFormError("Name, namespace, and value are required.");
      return;
    }

    await createSecret.mutateAsync({
      name: form.name,
      namespace: form.namespace,
      value: form.value,
    });
    await secretsQuery.refetch();
    setCreateOpen(false);
    resetForm();
  };

  const handleEdit = async () => {
    if (!editingSecret) {
      return;
    }
    setFormError(null);
    if (!form.name && !form.value) {
      setFormError("Provide a new name or value to update.");
      return;
    }

    await updateSecret.mutateAsync({
      secretId: editingSecret.id,
      name: form.name || undefined,
      value: form.value || undefined,
    });
    await secretsQuery.refetch();
    setEditOpen(false);
    setEditingSecret(null);
    resetForm();
  };

  const handleDelete = async (secretId: string) => {
    await deleteSecret.mutateAsync({ secretId });
    await secretsQuery.refetch();
  };

  const openEdit = (secret: SecretRow) => {
    setEditingSecret(secret);
    setForm({
      name: secret.name,
      namespace: secret.namespace,
      value: "",
    });
    setEditOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-bold text-3xl tracking-tight">Secrets</h1>
          <p className="text-muted-foreground">
            Manage long-lived org secrets with explicit reveal access.
          </p>
        </div>
        <Button
          onClick={() => {
            resetForm();
            setCreateOpen(true);
          }}
        >
          Add secret
        </Button>
      </div>

      {secretsQuery.isLoading ? (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Rotated</TableHead>
                <TableHead>Secret</TableHead>
                <TableHead>Action</TableHead>
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
                <TableHead>Description</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Rotated</TableHead>
                <TableHead>Secret</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {secretsQuery.data?.map((secret) => (
                <SecretRow
                  key={secret.id}
                  onDelete={handleDelete}
                  onEdit={openEdit}
                  secret={secret}
                />
              ))}
            </TableBody>
          </Table>
          {secretsQuery.data?.length === 0 && (
            <div className="py-12 text-center text-muted-foreground">
              No secrets yet.
            </div>
          )}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add secret</DialogTitle>
            <DialogDescription>
              Secrets are encrypted at rest and scoped to your org.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="secret-name">Name</Label>
              <Input
                id="secret-name"
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="secret-namespace">Namespace</Label>
              <Input
                id="secret-namespace"
                value={form.namespace}
                onChange={(event) =>
                  setForm({ ...form, namespace: event.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="secret-value">Value</Label>
              <Input
                id="secret-value"
                type="password"
                value={form.value}
                onChange={(event) =>
                  setForm({ ...form, value: event.target.value })
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
            <Button onClick={handleCreate}>Create secret</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit secret</DialogTitle>
            <DialogDescription>
              Update the secret name or rotate the value.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="secret-edit-name">Name</Label>
              <Input
                id="secret-edit-name"
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="secret-edit-namespace">Namespace</Label>
              <Input id="secret-edit-namespace" value={form.namespace} disabled />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="secret-edit-value">New Value (optional)</Label>
              <Input
                id="secret-edit-value"
                type="password"
                value={form.value}
                onChange={(event) =>
                  setForm({ ...form, value: event.target.value })
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
                setEditingSecret(null);
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
