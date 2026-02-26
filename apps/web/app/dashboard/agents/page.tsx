"use client";

import { useState } from "react";
import { PlusCircle } from "lucide-react";
import { useRouter } from "next/navigation";
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
import { Skeleton } from "@/components/ui/skeleton";

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
          {[...Array(3)].map((_, i) => (
            <Skeleton className="h-[140px] w-full rounded-xl" key={i} />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {agentsQuery.data?.map((agent) => (
            <Card key={agent.id}>
              <CardHeader>
                <CardTitle>{agent.name}</CardTitle>
                <CardDescription>
                  {agent.description || "No description"}
                </CardDescription>
              </CardHeader>
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
