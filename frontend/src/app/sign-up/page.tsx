"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { register, login } from "@/lib/api-client";
import type { RoleName } from "@/lib/types";

export default function SignUpPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<RoleName>("patient");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);
    try {
      await register({ email, username, password, role });
      setSuccess(true);
      // Auto-login after registration
      await login(username, password);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  const roleDescriptions: Record<RoleName, string> = {
    patient: "Access your own medical records, family tree, and health reports",
    doctor: "Manage patient visits, diagnoses, prescriptions, and run ML predictions",
    lab: "Create and manage lab reports, enter test results",
    admin: "Full system access (first user only)",
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-lg p-6">
        <h1 className="text-2xl font-semibold">Create Account</h1>
        <p className="mt-1 text-sm text-muted">Join LifeChain AI healthcare platform</p>

        {success ? (
          <div className="mt-4 rounded-md border border-success/30 bg-success/10 p-3 text-sm text-success">
            Account created successfully! Redirecting...
          </div>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={onSubmit}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">Username</label>
                <input
                  className="input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="johndoe"
                  required
                  minLength={3}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Email</label>
                <input
                  className="input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="john@example.com"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">Password</label>
                <input
                  className="input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={8}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Confirm Password</label>
                <input
                  className="input"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Role</label>
              <select
                className="input"
                value={role}
                onChange={(e) => setRole(e.target.value as RoleName)}
              >
                <option value="patient">Patient</option>
                <option value="doctor">Doctor</option>
                <option value="lab">Lab Technician</option>
                <option value="admin">Admin</option>
              </select>
              <p className="mt-1 text-xs text-muted">{roleDescriptions[role]}</p>
            </div>

            {error ? <p className="text-sm text-danger">{error}</p> : null}

            <button className="btn-primary w-full" type="submit" disabled={loading}>
              {loading ? "Creating account..." : "Create Account"}
            </button>

            <p className="text-center text-sm text-muted">
              Already have an account?{" "}
              <Link href="/sign-in" className="text-primary hover:underline">
                Sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
