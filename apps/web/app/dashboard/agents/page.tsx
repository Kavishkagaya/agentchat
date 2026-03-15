"use client";

import { Bot, Edit, PlusCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
      <div className="flex flex-wrap items-center justify-between">
        <div>
          <h1 className="font-bold text-3xl">Agents</h1>
          <p className="text-muted-foreground mt-1">
            Build and manage your AI agents.
          </p>
        </div>
        <Button onClick={() => setAddDialogOpen(true)}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Add agent
        </Button>
      </div>

      {agentsQuery.isLoading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {new Array(3).fill(null).map((_, i) => (
            <Skeleton
              className="h-56 w-full rounded-lg"
              key={`skeleton-${i}`}
            />
          ))}
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {(agentsQuery.data as AgentWithModel[] | undefined)?.map((agent) => (
            <Card
              key={agent.id}
              className="flex flex-col cursor-pointer transition-all hover:shadow-lg group"
              onClick={() => router.push(`/dashboard/agents/${agent.id}`)}
            >
              <CardHeader className="pb-3">
                <CardTitle className="line-clamp-1 group-hover:text-primary transition-colors font-mono">
                  {agent.name}
                </CardTitle>
                <CardDescription className="line-clamp-2">
                  {agent.description || "No description"}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 space-y-2 pb-3">
                {agent.model && (
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                    <span className="font-mono">
                      Model: {agent.model.kind}/{agent.model.name}
                    </span>
                  </div>
                )}
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
                  <span>
                    Updated: {new Date(agent.updatedAt).toLocaleDateString()}
                  </span>
                </div>
              </CardContent>
              <div className="flex gap-2 border-t px-6 py-3">
                <Button
                  className="flex-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push(`/dashboard/agents/${agent.id}`);
                  }}
                  size="sm"
                  variant="outline"
                >
                  <Edit className="mr-1.5 h-3.5 w-3.5" />
                  Configure
                </Button>
              </div>
            </Card>
          ))}
          {agentsQuery.data?.length === 0 && (
            <div className="col-span-full rounded-lg border-2 border-dashed py-16 text-center">
              <div className="flex flex-col items-center justify-center space-y-4">
                <div className="rounded-full bg-secondary p-4">
                  <Bot className="h-8 w-8 text-primary" />
                </div>
                <div className="space-y-1">
                  <div className="text-base font-semibold">
                    No agents deployed yet.
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Create your first agent to get started.
                  </p>
                </div>
                <Button size="sm" onClick={() => setAddDialogOpen(true)}>
                  Deploy First Agent
                </Button>
              </div>
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
              <Skeleton className="h-[140px] w-full rounded-lg" />
            ) : (
              publicAgentsQuery.data?.map((agent: any) => (
                <Card key={agent.id}>
                  <CardHeader className="space-y-2">
                    <CardTitle className="text-base font-mono">
                      {agent.name}
                    </CardTitle>
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
              <div className="col-span-full rounded-lg border-2 border-dashed py-10 text-center text-muted-foreground">
                No public agents yet.
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Close
            </Button>
            <Button onClick={() => router.push("/dashboard/agents/new")}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
