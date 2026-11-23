import type { User } from "../types";
import { api } from "./client";

export const authApi = {
  me: () => api<{ user: User }>("/auth/me"),
  register: (body: { email: string; password: string; displayName: string }) =>
    api<{ user: User }>("/auth/register", { method: "POST", body }),
  login: (body: { email: string; password: string }) => api<{ user: User }>("/auth/login", { method: "POST", body }),
  logout: () => api("/auth/logout", { method: "POST" }),
  updateProfile: (body: { displayName?: string; bio?: string; replyLength?: "short" | "medium" | "long" }) =>
    api<{ user: User }>("/auth/me", { method: "PATCH", body }),
  deleteAccount: (password: string) => api("/auth/me", { method: "DELETE", body: { password } }),
};
