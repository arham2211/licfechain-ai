"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowLeft,
  Dna,
  Eye,
  EyeOff,
  Fingerprint,
  Heart,
  Lock,
  Mail,
  Shield,
} from "lucide-react";
import { login, loginWithCnic } from "@/lib/api-client";

const floatingParticles = [
  { top: "12%", left: "18%", duration: 3.2, delay: 0.2 },
  { top: "24%", left: "74%", duration: 4.1, delay: 0.9 },
  { top: "37%", left: "10%", duration: 3.7, delay: 1.5 },
  { top: "52%", left: "66%", duration: 4.4, delay: 0.5 },
  { top: "71%", left: "28%", duration: 3.5, delay: 1.1 },
  { top: "82%", left: "84%", duration: 4.6, delay: 1.8 },
];

const patientSamples = [
  { label: "Sarah", cnic: "42201-1234567-8" },
  { label: "Arham", cnic: "42101-8765432-1" },
];

export default function SignInPage() {
  const [loginMethod, setLoginMethod] = useState<"patient" | "doctor" | "lab" | "admin">("patient");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [cnic, setCnic] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const isPatientLogin = loginMethod === "patient";

  const loginMeta: Record<Exclude<typeof loginMethod, "patient">, {
    label: string;
    hint: string;
    sample: string;
    password: string;
  }> = {
    doctor: {
      label: "Doctor Login",
      hint: "Use your doctor username or email",
      sample: "aryan.khan@lifechain.local",
      password: "Aryan@12345",
    },
    lab: {
      label: "Lab Login",
      hint: "Use your lab email to access the portal",
      sample: "lab@lifechaindiagnostics.com",
      password: "Lab@2024!!",
    },
    admin: {
      label: "Admin Login",
      hint: "Use your administrator username or email",
      sample: "admin",
      password: "Admin@2024!!",
    },
  };

  const activeStaffMeta = !isPatientLogin ? loginMeta[loginMethod] : null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (isPatientLogin) {
        await loginWithCnic(cnic);
        router.push("/dashboard");
      } else {
        await login(identifier, password);
        router.push("/dashboard");
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Login failed. Please check your credentials.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-50 font-sans text-slate-900">
      <div className="absolute inset-0 -z-20 bg-gradient-to-br from-slate-50 via-white to-blue-50/50" />
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] h-[50%] w-[50%] animate-pulse rounded-full bg-primary-200/20 blur-[100px]" />
        <div className="delay-1000 absolute right-[-10%] bottom-[-10%] h-[50%] w-[50%] animate-pulse rounded-full bg-purple-200/20 blur-[100px]" />
      </div>

      <button
        onClick={() => router.push("/")}
        className="absolute top-6 left-6 z-50 flex items-center gap-2 rounded-xl border border-slate-200/60 bg-white/60 px-4 py-2.5 text-slate-600 shadow-sm backdrop-blur-sm transition-colors hover:text-primary-600 hover:shadow-md"
      >
        <ArrowLeft size={18} />
        <span className="text-sm font-medium">Back to Home</span>
      </button>

      <div className="relative z-10 flex min-h-screen items-center justify-center p-4 lg:p-8">
        <div className="mx-auto grid w-full max-w-7xl items-center gap-8 lg:grid-cols-2 lg:gap-16">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, ease: "easeOut" }}
            className="perspective-1000 relative hidden h-[600px] w-full flex-col items-center justify-center lg:flex"
          >
            <div className="preserve-3d relative h-[500px] w-[500px]">
              <motion.div
                animate={{
                  boxShadow: [
                    "0 0 20px rgba(14, 165, 233, 0.2)",
                    "0 0 60px rgba(14, 165, 233, 0.6)",
                    "0 0 20px rgba(14, 165, 233, 0.2)",
                  ],
                }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                className="absolute top-1/2 left-1/2 z-10 flex h-24 w-24 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-gradient-to-tr from-primary-500 to-cyan-400 shadow-lg"
              >
                <Activity className="h-10 w-10 text-white" />
              </motion.div>

              <motion.div
                animate={{ rotateX: [70, 70], rotateZ: [0, 360] }}
                transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                className="preserve-3d absolute top-1/2 left-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-primary-400/30 border-t-primary-500 shadow-[0_0_15px_rgba(14,165,233,0.3)]"
              />

              <motion.div
                animate={{ rotateY: [60, 60], rotateZ: [360, 0] }}
                transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
                className="preserve-3d absolute top-1/2 left-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full border-[2px] border-dashed border-purple-400/40"
              >
                <div className="absolute top-0 left-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-purple-500 shadow-lg shadow-purple-500/50" />
              </motion.div>

              <motion.div
                animate={{ rotateX: [45, 45], rotateY: [45, 45], rotateZ: [0, 360] }}
                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                className="preserve-3d absolute top-1/2 left-1/2 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-300/30"
              >
                <div className="absolute right-[15%] bottom-[10%] flex h-6 w-6 items-center justify-center rounded-full border border-emerald-400 bg-emerald-400/20 shadow-lg backdrop-blur-md">
                  <Shield size={12} className="text-emerald-600" />
                </div>
              </motion.div>

              <motion.div
                animate={{ y: [-15, 15, -15], rotateX: 5, rotateY: -5 }}
                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                className="absolute top-20 left-0 z-20 w-48 rounded-2xl border border-white/40 bg-white/70 p-4 shadow-xl backdrop-blur-xl"
              >
                <div className="mb-2 flex items-center gap-3">
                  <div className="rounded-lg bg-rose-100 p-2 text-rose-600">
                    <Heart size={16} />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500">Heart Rate</p>
                    <p className="text-sm font-bold text-slate-800">72 BPM</p>
                  </div>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <motion.div
                    animate={{ width: ["60%", "75%", "60%"] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="h-full rounded-full bg-rose-500"
                  />
                </div>
              </motion.div>

              <motion.div
                animate={{ y: [20, -20, 20], rotateX: -5, rotateY: 5 }}
                transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                className="absolute right-0 bottom-20 z-20 w-52 rounded-2xl border border-white/40 bg-white/70 p-4 shadow-xl backdrop-blur-xl"
              >
                <div className="mb-2 flex items-center gap-3">
                  <div className="rounded-lg bg-blue-100 p-2 text-blue-600">
                    <Dna size={16} />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500">Genomic Sequence</p>
                    <p className="text-sm font-bold text-slate-800">Matching...</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <motion.div
                      key={i}
                      animate={{ height: ["10px", "24px", "10px"] }}
                      transition={{ duration: 1, repeat: Infinity, delay: i * 0.1 }}
                      className="w-1.5 rounded-full bg-blue-500"
                    />
                  ))}
                </div>
              </motion.div>

              {floatingParticles.map((particle, i) => (
                <motion.div
                  key={i}
                  className="absolute h-2 w-2 rounded-full bg-slate-400/50"
                  style={{
                    top: particle.top,
                    left: particle.left,
                  }}
                  animate={{ y: [0, -40, 0], opacity: [0, 1, 0], scale: [0, 1.5, 0] }}
                  transition={{ duration: particle.duration, repeat: Infinity, delay: particle.delay }}
                />
              ))}
            </div>

            <div className="relative z-10 mt-12 text-center">
              <h1 className="mb-2 bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-3xl font-bold text-transparent">
                LifeChain AI
              </h1>
              <p className="mx-auto max-w-xs text-sm leading-relaxed text-slate-500">
                The next generation of secure, decentralized healthcare
                management.
              </p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
            className="flex justify-center"
          >
            <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-slate-100 bg-white p-8 shadow-[0_20px_50px_rgba(0,0,0,0.05)]">
              <div className="absolute top-0 left-0 h-2 w-full bg-gradient-to-r from-primary-500 via-purple-500 to-pink-500" />

              <div className="mb-6">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                  <Fingerprint size={24} />
                </div>
                <h2 className="text-2xl font-bold text-slate-900">Welcome Back</h2>
                <p className="mt-1 text-slate-500">Sign in to access your portal</p>
              </div>

              <div className="mb-6 flex rounded-xl bg-slate-50 p-1">
                <button
                  type="button"
                  onClick={() => setLoginMethod("patient")}
                  className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-all ${
                    isPatientLogin
                      ? "bg-white text-primary-600 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  Patient
                </button>
                <button
                  type="button"
                  onClick={() => setLoginMethod("doctor")}
                  className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-all ${
                    loginMethod === "doctor"
                      ? "bg-white text-primary-600 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  Doctor
                </button>
                <button
                  type="button"
                  onClick={() => setLoginMethod("lab")}
                  className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-all ${
                    loginMethod === "lab"
                      ? "bg-white text-primary-600 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  Lab
                </button>
                <button
                  type="button"
                  onClick={() => setLoginMethod("admin")}
                  className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-all ${
                    loginMethod === "admin"
                      ? "bg-white text-primary-600 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  Admin
                </button>
              </div>

              {error && (
                <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <form onSubmit={onSubmit} className="space-y-5">
                {isPatientLogin ? (
                  <div>
                    <label className="mb-2 block text-xs font-semibold tracking-wider text-slate-500 uppercase">
                      CNIC Number
                    </label>
                    <div className="relative">
                      <Fingerprint
                        className="absolute top-1/2 left-4 -translate-y-1/2 text-slate-400"
                        size={18}
                      />
                      <input
                        type="text"
                        required
                        pattern="\d{5}-\d{7}-\d{1}"
                        title="Format: 12345-1234567-1"
                        value={cnic}
                        onChange={(e) => setCnic(e.target.value)}
                        className="block w-full rounded-xl border border-slate-200 bg-slate-50 p-3.5 pl-11 text-sm text-slate-900 transition-all hover:bg-slate-100/50 focus:border-transparent focus:ring-2 focus:ring-primary-500"
                        placeholder="00000-0000000-0"
                      />
                    </div>
                    <p className="mt-2 text-xs text-slate-400">
                      Enter your 13-digit CNIC number to access your medical records.
                    </p>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="mb-2 block text-xs font-semibold tracking-wider text-slate-500 uppercase">
                        Username or Email
                      </label>
                      <div className="relative">
                        <Mail
                          className="absolute top-1/2 left-4 -translate-y-1/2 text-slate-400"
                          size={18}
                        />
                        <input
                          type="text"
                          required
                          value={identifier}
                          onChange={(e) => setIdentifier(e.target.value)}
                          className="block w-full rounded-xl border border-slate-200 bg-slate-50 p-3.5 pl-11 text-sm text-slate-900 transition-all hover:bg-slate-100/50 focus:border-transparent focus:ring-2 focus:ring-primary-500"
                          placeholder={activeStaffMeta?.sample ?? "Enter your username"}
                        />
                      </div>
                      <p className="mt-2 text-xs text-slate-400">
                        {activeStaffMeta?.hint}
                      </p>
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-semibold tracking-wider text-slate-500 uppercase">
                        Password
                      </label>
                      <div className="relative">
                        <Lock
                          className="absolute top-1/2 left-4 -translate-y-1/2 text-slate-400"
                          size={18}
                        />
                        <input
                          type={showPassword ? "text" : "password"}
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="block w-full rounded-xl border border-slate-200 bg-slate-50 p-3.5 pr-11 pl-11 text-sm text-slate-900 transition-all hover:bg-slate-100/50 focus:border-transparent focus:ring-2 focus:ring-primary-500"
                          placeholder="••••••••"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((value) => !value)}
                          className="absolute top-1/2 right-4 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600"
                        >
                          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                      <div className="mt-2 flex justify-end">
                        <a href="#" className="text-xs font-medium text-primary-600 hover:text-primary-700">
                          Forgot password?
                        </a>
                      </div>
                    </div>
                  </>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-2 flex w-full items-center justify-center rounded-xl border border-transparent bg-slate-900 px-4 py-3.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-slate-800 focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {loading ? (
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  ) : (
                    <>
                      <span>{isPatientLogin ? "Access Records" : `Sign In as ${activeStaffMeta?.label.replace(" Login", "")}`}</span>
                      <ArrowLeft className="ml-2 rotate-180" size={16} />
                    </>
                  )}
                </button>
              </form>

              <div className="mt-8 border-t border-slate-100 pt-6">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  {isPatientLogin ? (
                    <>
                      {patientSamples.map((sample) => (
                        <div
                          key={sample.cnic}
                          className="cursor-pointer rounded-lg border border-slate-100 bg-slate-50/50 p-2.5 text-center transition-colors hover:bg-slate-100/70"
                          title={`Use ${sample.label}'s sample CNIC`}
                          onClick={() => setCnic(sample.cnic)}
                        >
                          <span className="mb-1 block text-slate-400">Sample CNIC ({sample.label})</span>
                          <span className="font-mono font-medium text-slate-700">{sample.cnic}</span>
                        </div>
                      ))}
                    </>
                  ) : (
                    <>
                      <div
                        className="col-span-2 cursor-pointer rounded-lg border border-slate-100 bg-slate-50/50 p-2.5 text-center transition-colors hover:bg-slate-100/70"
                        title={`Use ${activeStaffMeta?.sample}`}
                        onClick={() => {
                          if (!activeStaffMeta) return;
                          setIdentifier(activeStaffMeta.sample);
                          setPassword(activeStaffMeta.password);
                        }}
                      >
                        <span className="mb-1 block text-slate-400">{activeStaffMeta?.label}</span>
                        <span className="font-mono font-medium text-slate-700">
                          {activeStaffMeta?.sample}
                        </span>
                      </div>
                      <div className="col-span-2 rounded-lg border border-slate-100 bg-slate-50/50 p-2.5 text-center">
                        <span className="mb-1 block text-slate-400">Password</span>
                        <span className="font-mono font-medium text-slate-700">
                          {activeStaffMeta?.password}
                        </span>
                      </div>
                    </>
                  )}
                </div>
                <p className="mt-4 text-center text-xs text-slate-400">
                  {!isPatientLogin && (
                    <span>
                      Click the sample credential card to autofill this {activeStaffMeta?.label.toLowerCase()}.
                    </span>
                  )}
                </p>
              </div>

              <div className="mt-6 text-center">
                <p className="text-sm text-slate-500">
                  New to LifeChain?{" "}
                  <button
                    onClick={() => router.push("/sign-up")}
                    className="font-semibold text-primary-600 hover:text-primary-500"
                  >
                    Create account
                  </button>
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
