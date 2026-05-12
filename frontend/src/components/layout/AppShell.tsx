"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, Users, GitBranch, Stethoscope, CalendarDays,
  FlaskConical, Brain, BarChart3, Globe, ScanLine, Smile, FileText,
  LogOut, Menu, X, Languages, ChevronRight, Heart,
  type LucideIcon,
} from "lucide-react";
import { logout, api } from "@/lib/api-client";
import { getUser } from "@/lib/auth-store";
import { AppLanguage } from "@/lib/language";
import { useLanguage } from "@/components/providers/LanguageProvider";
import type { RoleName } from "@/lib/types";

type NavItem = {
  href: string;
  key: string;
  patientKey?: string;
  doctorKey?: string;
  icon: LucideIcon;
  roles: RoleName[];
};

const allRoles: RoleName[] = ["admin", "doctor", "patient", "lab"];

const navItems: NavItem[] = [
  { href: "/dashboard", key: "dashboard", patientKey: "myDashboard", doctorKey: "myDashboard", icon: LayoutDashboard, roles: allRoles },
  { href: "/patients", key: "patients", patientKey: "myProfile", doctorKey: "myPatients", icon: Users, roles: ["admin", "doctor", "patient"] },
  { href: "/doctors", key: "doctors", icon: Stethoscope, roles: ["admin"] },
  { href: "/family", key: "familyTree", icon: GitBranch, roles: ["admin", "doctor", "patient"] },
  { href: "/visits", key: "visits", icon: CalendarDays, roles: ["admin", "doctor", "patient"] },
  { href: "/labs", key: "labs", patientKey: "labReports", doctorKey: "labReports", icon: FlaskConical, roles: ["admin", "doctor", "patient"] },
  { href: "/labs/labs", key: "labs", icon: FlaskConical, roles: ["lab"] },
  { href: "/labs/reports", key: "reports", icon: BarChart3, roles: ["lab"] },
  { href: "/labs/reports", key: "patientReports", icon: FileText, roles: ["admin"] },
  { href: "/reports", key: "progressionGraph", patientKey: "healthReports", doctorKey: "healthReports", icon: BarChart3, roles: ["admin", "doctor", "patient"] },
];



const roleBadge: Record<string, string> = {
  admin: "bg-red-500/15 text-red-500",
  doctor: "bg-primary/15 text-primary",
  patient: "bg-cyan-500/15 text-cyan-600 border border-cyan-500/20",
  lab: "bg-amber-500/15 text-amber-500",
};

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const { language, changeLanguage, tr } = useLanguage();
  const user = getUser();
  const userRoles: RoleName[] = user?.roles ?? [];
  const primaryRole = userRoles[0] ?? "patient";

  const isDoctor = userRoles.includes("doctor") && !userRoles.includes("patient");
  const isPatientRole = primaryRole === "patient";
  const isLab = userRoles.includes("lab");

  const [labName, setLabName] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);

  useEffect(() => {
    if (!isLab) return;
    api.request<{ lab_id: string; lab_name: string; email?: string }[]>("/labs")
      .then((allLabs) => {
        const userEmail = (user?.email ?? "").toLowerCase();
        const matched = allLabs.find((l) => (l.email ?? "").toLowerCase() === userEmail) ?? null;
        if (matched) setLabName(matched.lab_name);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLab]);

  useEffect(() => {
    const pid = user?.patient_id;
    if (!pid) return;
    api.request<{ first_name: string; last_name: string }>(`/patients/${pid}`)
      .then((p) => setDisplayName(`${p.first_name} ${p.last_name}`))
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.patient_id]);
  // Premium shell = glassmorphism BG + frosted sidebar (all roles)
  const usePremiumShell = true;

  // Each role always sees their own nav items — no dual toggling
  const visibleNavItems = navItems.filter((item) =>
    userRoles.some((role) => item.roles.includes(role))
  );


  async function handleLogout() {
    try {
      await logout();
    } finally {
      router.push("/sign-in");
    }
  }

  function handleLanguageChange(nextLanguage: AppLanguage) {
    if (nextLanguage === language) return;
    changeLanguage(nextLanguage);
    // Soft refresh current route so client pages re-run data loaders immediately.
    router.refresh();
  }

  return (
    <div className={`min-h-screen ${usePremiumShell ? "patient-shell" : "bg-background"}`}>
      {usePremiumShell && (
        <>
          <div className="pointer-events-none fixed inset-0 -z-20 bg-gradient-to-br from-slate-50 via-white to-cyan-50/70" />
          <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
            <div className="absolute top-[-8%] left-[-10%] h-[34rem] w-[34rem] rounded-full bg-primary-200/25 blur-[120px]" />
            <div className="absolute right-[-10%] bottom-[-8%] h-[30rem] w-[30rem] rounded-full bg-cyan-200/30 blur-[120px]" />
            <div className="absolute top-1/3 left-1/3 h-72 w-72 rounded-full bg-sky-100/25 blur-[90px]" />
          </div>
        </>
      )}
      {/* ── Header ── */}
      <header
        className={`sticky top-0 z-40 border-b ${usePremiumShell ? "border-primary/10" : "border-border/50"}`}
        style={{
          background: usePremiumShell ? "rgba(255,255,255,0.86)" : "var(--card)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
      >
        <div className="mx-auto flex max-w-[1440px] items-center justify-between px-4 py-3 lg:px-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 shadow-lg shadow-primary/20">
                <Heart className="h-5 w-5 text-white" strokeWidth={2.5} />
              </div>
              <span className="text-lg font-bold gradient-text tracking-tight">LifeChain AI</span>
            </div>
            {userRoles.length > 0 && (
              <span className={`badge ${roleBadge[primaryRole] ?? "bg-muted/15 text-muted"}`}>
                {primaryRole.toUpperCase()}
              </span>
            )}
          </div>

          <button
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/50 transition-colors hover:bg-primary/5 md:hidden"
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          <div className="hidden items-center gap-3 md:flex">
            <div className="flex items-center gap-1.5 rounded-lg border border-border/50 px-2.5 py-1.5">
              <Languages size={14} className="text-muted" />
              <select
                className="navbar-lang-select"
                value={language}
                onChange={(e) => handleLanguageChange(e.target.value as AppLanguage)}
              >
                <option value="en">EN</option>
                <option value="ur">UR</option>
                <option value="fr">FR</option>
                <option value="de">DE</option>
              </select>
            </div>
            <div className="h-5 w-px bg-border/50" />

            {false && (
              <div className="flex items-center gap-1 rounded-full bg-slate-100 p-1 mr-4">
              </div>
            )}

            <div className="text-sm font-medium text-muted">
              {isLab && labName ? labName : displayName ?? user?.username ?? tr("unknownUser")}
            </div>
            <button
              className="flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-500 transition-colors hover:bg-red-500/20"
              onClick={handleLogout}
            >
              <LogOut size={14} />
              {tr("logout")}
            </button>
          </div>
        </div>


      </header >

      <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-0 md:grid-cols-[280px_1fr]">
        {/* ── Sidebar ── */}
        <AnimatePresence>
          {(menuOpen || typeof window === "undefined") && (
            <motion.aside
              className="md:hidden border-b border-border/50 bg-card p-3"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              <SidebarContent
                items={visibleNavItems}
                pathname={pathname}
                tr={tr}
                isPremium={usePremiumShell}
                isPatient={isPatientRole}
                isDoctor={isDoctor}
                onNav={() => setMenuOpen(false)}
              />
              <div className="mt-4 space-y-2 border-t border-border/50 pt-4">
                <div className="flex items-center gap-1.5 rounded-lg border border-border/50 px-3 py-2">
                  <Languages size={14} className="text-muted" />
                  <select
                    className="flex-1 bg-transparent text-sm outline-none"
                    value={language}
                    onChange={(e) => handleLanguageChange(e.target.value as AppLanguage)}
                  >
                    <option value="en">English</option>
                    <option value="ur">Urdu</option>
                    <option value="fr">French</option>
                    <option value="de">German</option>
                  </select>
                </div>
                <button
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-500/10 px-3 py-2.5 text-sm font-semibold text-red-500 transition-colors hover:bg-red-500/20"
                  onClick={handleLogout}
                >
                  <LogOut size={16} />
                  {tr("logout")}
                </button>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        <aside className="hidden md:block">
          <div className="sticky top-[65px] h-[calc(100vh-65px)] overflow-y-auto p-4">
            <div className={usePremiumShell ? "rounded-[28px] border border-white/70 bg-white/72 p-3 shadow-[0_25px_80px_rgba(2,132,199,0.12)] backdrop-blur-2xl" : ""}>
              <SidebarContent items={visibleNavItems} pathname={pathname} tr={tr} isPremium={usePremiumShell} isPatient={isPatientRole} isDoctor={isDoctor} />
            </div>
          </div>
        </aside>

        <main className={`min-w-0 p-4 lg:p-6 ${usePremiumShell ? "pt-6 lg:pt-8" : ""}`}>{children}</main>
      </div>
    </div >
  );
}

function SidebarContent({
  items,
  pathname,
  tr,
  isPremium,
  isPatient,
  isDoctor,
  onNav,
}: {
  items: NavItem[];
  pathname: string;
  tr: (key: string) => string;
  isPremium?: boolean;
  isPatient?: boolean;
  isDoctor?: boolean;
  onNav?: () => void;
}) {
  return (
    <nav className="space-y-1">
      {items.map((item) => {
        // Only use prefix-match when no item has an exact href match for the current path
        const hasExactMatch = items.some((i) => i.href === pathname);
        const active = pathname === item.href || (!hasExactMatch && pathname?.startsWith(item.href + "/"));
        const Icon = item.icon;
        const label = isDoctor && item.doctorKey
          ? tr(item.doctorKey)
          : isPatient && item.patientKey
          ? tr(item.patientKey)
          : tr(item.key);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNav}
            className="group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200"
          >
            {active && (
              <motion.div
                layoutId="activeNav"
                className="absolute inset-0 rounded-xl bg-gradient-to-r from-[var(--gradient-start)] to-[var(--gradient-end)]"
                style={{ boxShadow: "0 4px 15px -3px var(--primary-glow)" }}
                transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
              />
            )}
            <Icon
              size={18}
              className={`relative z-10 transition-colors duration-200 ${active ? "text-white" : isPremium ? "text-slate-700 group-hover:text-primary" : "text-muted group-hover:text-primary"
                }`}
            />
            <span
              className={`relative z-10 font-medium transition-colors duration-200 ${active ? "text-white" : isPremium ? "text-slate-800 group-hover:text-primary" : "text-foreground group-hover:text-primary"
                }`}
            >
              {label}
            </span>

            {active && <ChevronRight size={14} className="relative z-10 ml-auto text-white/60" />}
          </Link>
        );
      })}
    </nav>
  );
}
