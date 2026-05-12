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
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-100 via-blue-50 to-cyan-100">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="h-14 w-14 rounded-full border-2 border-blue-200 bg-white/80 shadow-xl" />
            <Loader2 className="absolute inset-0 h-14 w-14 animate-spin text-blue-500" />
          </div>
          <p className="gradient-text bg-clip-text text-lg font-bold text-transparent drop-shadow-sm">Loading secure workspace...</p>
        </div>
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
