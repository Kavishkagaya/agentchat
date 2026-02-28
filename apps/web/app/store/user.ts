import type { AxonUser } from "@axon/database";
import { create } from "zustand";

interface AxonUserState {
  actions: {
    setAxonUser: (user: AxonUser) => void;
    clearAxonUser: () => void;
  };
  axonUser: AxonUser | null;
  isLoaded: boolean;
}

const useAxonUserStore = create<AxonUserState>((set) => ({
  axonUser: null,
  isLoaded: false,

  actions: {
    setAxonUser: (user) => set({ axonUser: user, isLoaded: true }),
    clearAxonUser: () => set({ axonUser: null, isLoaded: true }),
  },
}));

export const useAxonUser = () =>
  useAxonUserStore((s) => {
    if (!s.isLoaded) {
      return null; // User data is still loading
    }
    return s.axonUser;
  });

export const useAxonUserActions = () => useAxonUserStore((s) => s.actions);
