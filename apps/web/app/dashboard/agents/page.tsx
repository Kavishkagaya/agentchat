"use client";

import { useState } from "react";
import { Edit, PlusCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { api } from "@/app/trpc/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
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
import { Skeleton } from "@/components/ui/skeleton";

type AgentWithModel = {
  id: string;
  name: string;
  description: string | null;
  updatedAt: Date;
  model: {
    name: string;
    kind: string;
  } | null;
};

export default function AgentsPage() {
  const router = useRouter();
  const agentsQuery = api.agents.list.useQuery();
  const publicAgentsQuery = api.agents.listPublic.useQuery();
  const copyAgent = api.agents.copyFromPublic.useMutation();

  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const handleCopy = async (agentId: string) => {
    await copyAgent.mutateAsync({ agentId });
    await agentsQuery.refetch();
    setAddDialogOpen(false);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-bold text-3xl tracking-tight">Agents</h1>
          <p className="text-muted-foreground">
            Manage your org agents and add public agents.
          </p>
        </div>
        <Button onClick={() => setAddDialogOpen(true)}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Add agent
        </Button>
      </div>

      {agentsQuery.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {new Array(3).fill(null).map((_, i) => (
            <Skeleton className="h-[200px] w-full rounded-xl" key={`skeleton-${i}`} />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {(agentsQuery.data as AgentWithModel[] | undefined)?.map((agent) => (
            <Card
              key={agent.id}
              className="flex flex-col cursor-pointer transition-colors hover:bg-muted"
              onClick={() => router.push(`/dashboard/agents/${agent.id}`)}
            >
              <CardHeader className="pb-3">
                <CardTitle className="line-clamp-1">{agent.name}</CardTitle>
                <CardDescription className="line-clamp-2">
                  {agent.description || "No description"}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 space-y-2 pb-3">
                {agent.model && (
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium">Model:</span>{" "}
                    {agent.model.kind}/{agent.model.name}
                  </div>
                )}
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium">Updated:</span>{" "}
                  {new Date(agent.updatedAt).toLocaleDateString()}
                </div>
              </CardContent>
              <div className="flex gap-2 border-t px-4 py-3">
                <Button
                  className="flex-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push(`/dashboard/agents/${agent.id}`);
                  }}
                  size="sm"
                  variant="outline"
                >
                  <Edit className="mr-1 h-3 w-3" />
                  Edit
                </Button>
              </div>
            </Card>
          ))}
          {agentsQuery.data?.length === 0 && (
            <div className="col-span-full rounded-xl border-2 border-dashed py-12 text-center text-muted-foreground">
              No agents yet.
            </div>
          )}
        </div>
      )}

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add agent</DialogTitle>
            <DialogDescription>
              Choose a public agent to copy or create your own.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            {publicAgentsQuery.isLoading ? (
              <Skeleton className="h-[140px] w-full rounded-xl" />
            ) : (
              publicAgentsQuery.data?.map((agent) => (
                <Card key={agent.id}>
                  <CardHeader className="space-y-2">
                    <CardTitle className="text-base">{agent.name}</CardTitle>
                    <CardDescription>
                      {agent.description || "No description"}
                    </CardDescription>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleCopy(agent.id)}
                    >
                      Add to org
                    </Button>
                  </CardHeader>
                </Card>
              ))
            )}
            {publicAgentsQuery.data?.length === 0 && (
              <div className="col-span-full rounded-xl border-2 border-dashed py-10 text-center text-muted-foreground">
                No public agents yet.
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Close
            </Button>
            <Button onClick={() => router.push("/dashboard/agents/new")}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
