"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getAccessToken } from "@/lib/auth-store";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    if (getAccessToken()) {
      router.replace("/dashboard");
    } else {
      router.replace("/sign-in");
    }
  }, [router]);
  return <div className="p-6 text-sm text-muted">Redirecting...</div>;
}
