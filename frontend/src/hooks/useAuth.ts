"use client";

export interface StoredUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export function getStoredUser(): StoredUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("piq-user");
  if (!raw) return null;
  try { return JSON.parse(raw) as StoredUser; } catch { return null; }
}

export function persistUser(user: StoredUser) {
  localStorage.setItem("piq-user", JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem("token");
  localStorage.removeItem("refresh_token");
  localStorage.removeItem("piq-user");
}

export function useAuth() {
  const user = getStoredUser();
  const isAuthenticated = typeof window !== "undefined" && !!localStorage.getItem("token");
  const role = user?.role ?? null;
  const isAdmin = role === "admin" || role === "manager";
  const isStudent = role === "user";

  return { user, isAuthenticated, role, isAdmin, isStudent };
}
