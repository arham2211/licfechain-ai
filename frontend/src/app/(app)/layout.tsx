"use client";

import { ReactNode, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { getMe } from "@/lib/api-client";
import { getAccessToken, saveUser, clearSession } from "@/lib/auth-store";
import { AppShell } from "@/components/layout/AppShell";

export default function PrivateLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function bootstrap() {
      const token = getAccessToken();
      if (!token) {
        router.replace("/sign-in");
        return;
      }
      try {
        const me = await getMe();
        if (!mounted) return;
        saveUser(me);
      } catch {
        clearSession();
        if (mounted) router.replace("/sign-in");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    bootstrap();
    return () => {
      mounted = false;
    };
  }, [router, pathname]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="h-12 w-12 rounded-full border-2 border-primary/20" />
            <Loader2 className="absolute inset-0 h-12 w-12 animate-spin text-primary" />
          </div>
          <p className="text-sm font-medium text-muted">Loading secure workspace...</p>
        </div>
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
