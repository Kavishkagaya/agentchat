import { create } from "zustand";

export interface User {
  createdAt: Date;
  email: string;
  firstName: string | null;
  imageUrl: string | null;
  lastName: string | null;
  updatedAt: Date;
  userId: string;
}

export interface Organization {
  createdAt: Date;
  name: string;
  orgId: string;
  planId: string;
  role: string; // Combined from membership
  updatedAt: Date;
}

interface UserState {
  actions: {
    setUserData: (user: User, organization: Organization | null) => void;
    clearUser: () => void;
  };
  isLoaded: boolean;
  organization: Organization | null;
  user: User | null;
}

const useUserStore = create<UserState>((set) => ({
  user: null,
  organization: null,
  isLoaded: false,

  actions: {
    setUserData: (user, organization) =>
      set({ user, organization, isLoaded: true }),
    clearUser: () => set({ user: null, organization: null, isLoaded: true }),
  },
}));

export const useAxonUser = () =>
  useUserStore((s) => {
    if (!s.isLoaded) {
      return null; // User data is still loading
    }
    return {
      ...s.user,
      organization: s.organization,
    };
  });

export const useUserActions = () => useUserStore((s) => s.actions);
