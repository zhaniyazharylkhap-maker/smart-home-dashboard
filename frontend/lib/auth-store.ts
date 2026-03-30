import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AuthUser = {
  id: number;
  name: string;
  email: string;
};

type AuthState = {
  token: string | null;
  user: AuthUser | null;
  setSession: (token: string, user: AuthUser) => void;
  clearSession: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setSession: (token, user) => set({ token, user }),
      clearSession: () => set({ token: null, user: null }),
    }),
    { name: "nexus-auth" }
  )
);
