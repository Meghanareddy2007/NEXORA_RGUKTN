"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

/**
 * Wraps the whole app. If there's no logged-in user (and we're not already
 * on /login), bounce to /login. Doesn't block rendering of /login itself.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (ready && !user && pathname !== "/login") {
      router.replace("/login");
    }
  }, [ready, user, pathname, router]);

  // On the login page, or once we know who's logged in, render normally.
  if (pathname === "/login") return <>{children}</>;
  if (!ready || !user) return null; // avoid a flash of protected content

  return <>{children}</>;
}
