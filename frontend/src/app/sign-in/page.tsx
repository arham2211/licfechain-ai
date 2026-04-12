"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Heart, Lock, Mail, ArrowRight, Loader2, Shield, Activity, Brain } from "lucide-react";
import { login } from "@/lib/api-client";

export default function SignInPage() {
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(usernameOrEmail, password);
      router.push("/dashboard");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to sign in";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* ── Left: Gradient Hero ── */}
      <div
        className="relative hidden w-1/2 overflow-hidden lg:flex lg:flex-col lg:items-center lg:justify-center"
        style={{ background: "linear-gradient(135deg, var(--gradient-start) 0%, #3a56d4 50%, var(--gradient-end) 100%)" }}
      >
        {/* Floating orbs */}
        <motion.div
          className="absolute -top-24 -left-24 h-80 w-80 rounded-full"
          style={{ background: "rgba(255,255,255,0.07)" }}
          animate={{ y: [0, 30, 0], x: [0, 15, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute top-1/3 -right-20 h-64 w-64 rounded-full"
          style={{ background: "rgba(255,255,255,0.05)" }}
          animate={{ y: [0, -25, 0], x: [0, -10, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-24 left-1/4 h-44 w-44 rounded-full"
          style={{ background: "rgba(255,255,255,0.04)" }}
          animate={{ y: [0, -20, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Content */}
        <motion.div
          className="relative z-10 px-12 text-center text-white"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm">
            <Heart size={40} strokeWidth={1.5} />
          </div>
          <h1 className="text-4xl font-bold tracking-tight">LifeChain AI</h1>
          <p className="mx-auto mt-4 max-w-md text-lg leading-relaxed text-white/70">
            Unified healthcare ecosystem with AI-powered diagnostics, longitudinal patient records, and intelligent clinical insights.
          </p>

          {/* Feature pills */}
          <motion.div
            className="mt-10 flex flex-wrap justify-center gap-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.6 }}
          >
            {[
              { icon: Brain, label: "AI Diagnostics" },
              { icon: Shield, label: "RBAC Security" },
              { icon: Activity, label: "Real-time Analytics" },
            ].map(({ icon: Ic, label }) => (
              <div key={label} className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm backdrop-blur-sm">
                <Ic size={14} />
                <span>{label}</span>
              </div>
            ))}
          </motion.div>

          {/* Stats */}
          <motion.div
            className="mt-10 flex justify-center gap-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.6 }}
          >
            {[
              { value: "5", label: "Disease Models" },
              { value: "4+", label: "AI Engines" },
              { value: "5", label: "Languages" },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-3xl font-bold">{s.value}</div>
                <div className="mt-1 text-xs text-white/50">{s.label}</div>
              </div>
            ))}
          </motion.div>
        </motion.div>
      </div>

      {/* ── Right: Sign-in Form ── */}
      <div className="flex w-full items-center justify-center px-6 lg:w-1/2">
        <motion.div
          className="w-full max-w-md"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
        >
          {/* Mobile logo */}
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--gradient-start)] to-[var(--gradient-end)] shadow-lg shadow-primary/20">
              <Heart size={20} className="text-white" />
            </div>
            <span className="text-xl font-bold gradient-text">LifeChain AI</span>
          </div>

          <div>
            <h2 className="text-2xl font-bold tracking-tight">Welcome back</h2>
            <p className="mt-1.5 text-sm text-muted">Sign in to your clinical workspace</p>
          </div>

          <form className="mt-8 space-y-5" onSubmit={onSubmit}>
            <div>
              <label className="mb-2 block text-sm font-medium">Username or Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  className="input pl-10"
                  value={usernameOrEmail}
                  onChange={(e) => setUsernameOrEmail(e.target.value)}
                  placeholder="doctor1 or doctor@lifechain.ai"
                  required
                />
              </div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium">Password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  className="input pl-10"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                />
              </div>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="alert-error"
              >
                {error}
              </motion.div>
            )}

            <button
              className="btn-primary w-full py-3 text-base"
              type="submit"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign In
                  <ArrowRight size={18} />
                </>
              )}
            </button>

            <p className="text-center text-sm text-muted">
              Don&apos;t have an account?{" "}
              <Link href="/sign-up" className="font-semibold text-primary hover:underline">
                Create account
              </Link>
            </p>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
