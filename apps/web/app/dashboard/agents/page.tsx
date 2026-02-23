"use client";

import { PlusCircle } from "lucide-react";
import { api } from "@/app/trpc/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function AgentsPage() {
  const { data: agents, isLoading } = api.agents.list.useQuery();

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <h1 className="font-bold text-3xl tracking-tight">Agents</h1>
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" />
          Create Agent
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton className="h-[120px] w-full rounded-xl" key={i} />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {agents?.map(
            (agent: {
              id: string;
              name: string;
              description: string | null;
            }) => (
              <Card
                className="cursor-pointer transition-colors hover:bg-muted/50"
                key={agent.id}
              >
                <CardHeader>
                  <CardTitle>{agent.name}</CardTitle>
                  <CardDescription>
                    {agent.description || "No description"}
                  </CardDescription>
                </CardHeader>
              </Card>
            )
          )}
          {agents?.length === 0 && (
            <div className="col-span-full rounded-xl border-2 border-dashed py-12 text-center text-muted-foreground">
              No agents found.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
