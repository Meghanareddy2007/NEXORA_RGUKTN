"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export type Department = "SMMS" | "TMS" | "TRACTION" | "COA" | "ADMIN";

export interface AuthUser {
  access_token: string;
  username: string;
  department: Department;
  full_name: string;
}

const STORAGE_KEY = "nexora_auth";

export function getStoredAuth(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function setStoredAuth(user: AuthUser | null) {
  if (typeof window === "undefined") return;
  if (user) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } else {
    window.localStorage.removeItem(STORAGE_KEY);
  }
  // let other components (Sidebar, TopBar) in this tab know auth changed
  window.dispatchEvent(new Event("nexora-auth-changed"));
}

export async function login(username: string, password: string): Promise<AuthUser> {
  const { data } = await api.post<AuthUser>("/api/auth/login", { username, password });
  setStoredAuth(data);
  return data;
}

export function logout() {
  setStoredAuth(null);
}

/** React hook: current logged-in user (or null), reactive across the app. */
export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setUser(getStoredAuth());
    setReady(true);
    const onChange = () => setUser(getStoredAuth());
    window.addEventListener("nexora-auth-changed", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("nexora-auth-changed", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  return { user, ready };
}

/** Department -> which nav sections / actions they're allowed to see. */
export const DEPARTMENT_LABELS: Record<Department, string> = {
  SMMS: "Signal & Telecom (SMMS)",
  TMS: "Engineering / Track (TMS)",
  TRACTION: "Traction Distribution (TDMS)",
  COA: "Corridor Operating Authority",
  ADMIN: "Administrator",
};

/** Only COA (and ADMIN) can approve blocks / run optimizer / trigger emergency actions. */
export function canApprove(department?: Department | null): boolean {
  return department === "COA" || department === "ADMIN";
}
