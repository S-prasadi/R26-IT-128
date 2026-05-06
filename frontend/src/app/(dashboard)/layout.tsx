"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Sidebar, Header } from "@/components/layout";
import { ROUTES } from "@/constants/routes";
import { getStoredUser } from "@/hooks/useAuth";
import { useNotifications } from "@/hooks/useNotifications";

const ADMIN_ONLY = ["/dashboard", "/users", "/roles"];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  useNotifications();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.replace(ROUTES.LOGIN); return; }

    const user = getStoredUser();
    const role = user?.role ?? null;
    const isAdminRoute = ADMIN_ONLY.some((r) => pathname === r || pathname.startsWith(r + "/"));
    if (isAdminRoute && role === "user") {
      router.replace(ROUTES.SKILL);
      return;
    }

    setReady(true);
  }, [pathname, router]);

  if (!ready) return null;

  return (
    <div style={{ display: "flex", height: "100vh", width: "100%", overflow: "hidden" }}>
      <Sidebar />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <Header />
        <main style={{ flex: 1, overflowY: "auto", padding: 24, background: "var(--bg)" }}>
          {children}
        </main>
      </div>
    </div>
  );
}
