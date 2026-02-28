"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect } from "react";
import { useAxonUserActions } from "../store/user";
import { api } from "../trpc/client";

export function AxonAuthProvider({ children }: { children: React.ReactNode }) {
  const { userId, isLoaded: isAuthLoaded } = useAuth();
  const { setAxonUser, clearAxonUser } = useAxonUserActions();
  const meQuery = api.user.me.useQuery(undefined, {
    enabled: isAuthLoaded && !!userId,
  });

  useEffect(() => {
    if (!isAuthLoaded) {
      return;
    }

    if (!userId) {
      // User logged out
      clearAxonUser();
      return;
    }

    // User logged in, wait for query to complete
    if (meQuery.isSuccess && meQuery.data) {
      setAxonUser(meQuery.data);
    }
  }, [
    userId,
    isAuthLoaded,
    meQuery.data,
    meQuery.isSuccess,
    setAxonUser,
    clearAxonUser,
  ]);

  return <>{children}</>;
}
