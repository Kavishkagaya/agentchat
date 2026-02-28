"use client";

import {
  ChevronDown,
  ChevronRight,
  Edit2,
  Eye,
  EyeOff,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
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

interface SecretRow {
  createdAt: Date;
  id: string;
  name: string;
  namespace: string;
  rotatedAt: Date | null;
  version: number;
}

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

function groupSecretsByNamespace(
  secrets: SecretRow[]
): [string, SecretRow[]][] {
  const grouped = secrets.reduce(
    (acc, secret) => {
      if (!acc[secret.namespace]) {
        acc[secret.namespace] = [];
      }
      acc[secret.namespace].push(secret);
      return acc;
    },
    {} as Record<string, SecretRow[]>
  );
  return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
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
      setRevealError(
        error instanceof Error ? error.message : "Failed to reveal secret"
      );
    }
  };

  return (
    <TableRow>
      <TableCell className="font-medium">
        <div>
          <div>{secret.name}</div>
          <div className="text-muted-foreground text-xs">v{secret.version}</div>
        </div>
      </TableCell>
      <TableCell className="text-sm">{formatDate(secret.createdAt)}</TableCell>
      <TableCell className="text-sm">
        {formatDate(secret.rotatedAt ?? null)}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <code className="rounded bg-muted px-2 py-1 font-mono text-xs">
            {revealedValue ? revealedValue : "••••••••••••"}
          </code>
          <Button
            onClick={() =>
              revealedValue ? setRevealedValue(null) : handleReveal()
            }
            size="sm"
            variant="ghost"
          >
            {revealedValue ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </Button>
          {revealError && (
            <span className="text-destructive text-xs">{revealError}</span>
          )}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Button onClick={() => onEdit(secret)} size="sm" variant="ghost">
            <Edit2 className="h-4 w-4" />
          </Button>
          <Button onClick={() => onDelete(secret.id)} size="sm" variant="ghost">
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
  const [expandedNamespaces, setExpandedNamespaces] = useState<Set<string>>(
    new Set()
  );
  const initialized = useRef(false);

  const toggleNamespace = (namespace: string) => {
    const next = new Set(expandedNamespaces);
    if (next.has(namespace)) {
      next.delete(namespace);
    } else {
      next.add(namespace);
    }
    setExpandedNamespaces(next);
  };

  useEffect(() => {
    if (
      !initialized.current &&
      secretsQuery.data &&
      secretsQuery.data.length > 0
    ) {
      const grouped = groupSecretsByNamespace(secretsQuery.data);
      if (grouped.length > 0) {
        setExpandedNamespaces(new Set([grouped[0][0]]));
        initialized.current = true;
      }
    }
  }, [secretsQuery.data]);

  const resetForm = () => {
    setForm({ ...EMPTY_SECRET });
    setFormError(null);
  };

  const handleCreate = async () => {
    setFormError(null);
    if (!(form.name && form.namespace && form.value)) {
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
    if (!(form.name || form.value)) {
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
        <div className="space-y-4">
          {secretsQuery.data && secretsQuery.data.length > 0 ? (
            groupSecretsByNamespace(secretsQuery.data).map(
              ([namespace, secrets]) => (
                <div
                  className="overflow-x-auto rounded-lg border"
                  key={namespace}
                >
                  <button
                    className="flex w-full items-center gap-2 bg-muted/50 px-4 py-3 hover:bg-muted"
                    onClick={() => toggleNamespace(namespace)}
                    type="button"
                  >
                    {expandedNamespaces.has(namespace) ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    <span className="font-medium">{namespace}</span>
                    <span className="text-muted-foreground text-xs">
                      ({secrets.length})
                    </span>
                  </button>
                  {expandedNamespaces.has(namespace) && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead>Rotated</TableHead>
                          <TableHead>Secret</TableHead>
                          <TableHead>Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {secrets.map((secret) => (
                          <SecretRow
                            key={secret.id}
                            onDelete={handleDelete}
                            onEdit={openEdit}
                            secret={secret}
                          />
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              )
            )
          ) : (
            <div className="rounded-lg border py-12 text-center text-muted-foreground">
              No secrets yet.
            </div>
          )}
        </div>
      )}

      <Dialog onOpenChange={setCreateOpen} open={createOpen}>
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
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                value={form.name}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="secret-namespace">Namespace</Label>
              <Input
                id="secret-namespace"
                onChange={(event) =>
                  setForm({ ...form, namespace: event.target.value })
                }
                value={form.namespace}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="secret-value">Value</Label>
              <Input
                id="secret-value"
                onChange={(event) =>
                  setForm({ ...form, value: event.target.value })
                }
                type="password"
                value={form.value}
              />
            </div>
            {formError && (
              <p className="text-destructive text-sm">{formError}</p>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setCreateOpen(false)} variant="outline">
              Cancel
            </Button>
            <Button onClick={handleCreate}>Create secret</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={setEditOpen} open={editOpen}>
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
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                value={form.name}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="secret-edit-namespace">Namespace</Label>
              <Input
                disabled
                id="secret-edit-namespace"
                value={form.namespace}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="secret-edit-value">New Value (optional)</Label>
              <Input
                id="secret-edit-value"
                onChange={(event) =>
                  setForm({ ...form, value: event.target.value })
                }
                type="password"
                value={form.value}
              />
            </div>
            {formError && (
              <p className="text-destructive text-sm">{formError}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                setEditOpen(false);
                setEditingSecret(null);
              }}
              variant="outline"
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
