"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { useEffect, useState } from "react";
import superjson from "superjson";
import { useUserActions } from "../store/user";
import { api } from "./client";

function getBaseUrl() {
  if (typeof window !== "undefined") {
    return "";
  }
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

function UserSync() {
  const { data: userResponse } = api.user.me.useQuery(undefined, {
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: true,
  });
  const { setUserData, clearUser } = useUserActions();

  useEffect(() => {
    if (userResponse) {
      const { organization, ...userData } = userResponse;
      setUserData(userData as any, organization as any);
    } else if (userResponse === null) {
      clearUser();
    }
  }, [userResponse, setUserData, clearUser]);

  return null;
}

export function TrpcProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    api.createClient({
      transformer: superjson,
      links: [
        httpBatchLink({
          url: `${getBaseUrl()}/api/trpc`,
        }),
      ],
    })
  );

  return (
    <api.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <UserSync />
        {children}
      </QueryClientProvider>
    </api.Provider>
  );
}
