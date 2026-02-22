import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UserState {
  userId: string | null;
  orgId: string | null;
  role: string | null; // 'owner' | 'member' | 'admin'
  isLoaded: boolean;
  
  setUser: (userId: string, orgId: string, role: string) => void;
  clearUser: () => void;
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      userId: null,
      orgId: null,
      role: null,
      isLoaded: false,

      setUser: (userId, orgId, role) => set({ userId, orgId, role, isLoaded: true }),
      clearUser: () => set({ userId: null, orgId: null, role: null, isLoaded: true }),
    }),
    {
      name: "axon-user-storage",
    }
  )
);
