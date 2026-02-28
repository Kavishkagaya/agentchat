"use client";

import { PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "../trpc/client";

export default function DashboardPage() {
  const { data: groups, isLoading } = api.groups.list.useQuery();

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="font-bold text-3xl tracking-tight">Dashboard</h1>
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" />
          New Group
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...new Array(3)].map((_, i) => (
            <Skeleton className="h-[120px] w-full rounded-xl" key={i} />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {groups?.map(
            (group: { id: string; title: string; status: string }) => (
              <Card
                className="cursor-pointer transition-colors hover:bg-muted/50"
                key={group.id}
              >
                <CardHeader>
                  <CardTitle>{group.title}</CardTitle>
                  <CardDescription className="capitalize">
                    Status: {group.status}
                  </CardDescription>
                </CardHeader>
              </Card>
            )
          )}
          {groups?.length === 0 && (
            <div className="col-span-full rounded-xl border-2 border-dashed py-12 text-center text-muted-foreground">
              No groups found. Create one to get started.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
