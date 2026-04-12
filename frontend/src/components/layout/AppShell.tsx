"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, Users, GitBranch, Stethoscope, CalendarDays,
  FlaskConical, Brain, BarChart3, Globe, ScanLine, Smile,
  LogOut, Menu, X, Languages, ChevronRight, Heart,
  type LucideIcon,
} from "lucide-react";
import { logout } from "@/lib/api-client";
import { getUser } from "@/lib/auth-store";
import { AppLanguage } from "@/lib/language";
import { useLanguage } from "@/components/providers/LanguageProvider";
import type { RoleName } from "@/lib/types";

type NavItem = {
  href: string;
  key: string;
  patientKey?: string;
  icon: LucideIcon;
  roles: RoleName[];
};

const allRoles: RoleName[] = ["admin", "doctor", "patient", "lab"];

const navItems: NavItem[] = [
  { href: "/dashboard", key: "dashboard", patientKey: "myDashboard", icon: LayoutDashboard, roles: allRoles },
  { href: "/patients", key: "patients", patientKey: "myProfile", icon: Users, roles: ["admin", "doctor", "patient"] },
  { href: "/family", key: "familyTree", icon: GitBranch, roles: ["admin", "doctor", "patient"] },
  { href: "/doctors", key: "doctors", icon: Stethoscope, roles: ["admin", "doctor"] },
  { href: "/visits", key: "visits", patientKey: "myVisits", icon: CalendarDays, roles: ["admin", "doctor", "patient"] },
  { href: "/labs", key: "labs", patientKey: "labReports", icon: FlaskConical, roles: ["admin", "doctor", "patient"] },
  { href: "/labs/labs", key: "labs", icon: FlaskConical, roles: ["lab"] },
  { href: "/labs/reports", key: "reports", icon: BarChart3, roles: ["lab"] },
  { href: "/reports", key: "reports", patientKey: "healthReports", icon: BarChart3, roles: ["admin", "doctor", "patient"] },
];



const roleBadge: Record<string, string> = {
  admin: "bg-red-500/15 text-red-500",
  doctor: "bg-primary/15 text-primary",
  patient: "bg-emerald-500/15 text-emerald-500",
  lab: "bg-amber-500/15 text-amber-500",
};

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const { language, changeLanguage, tr } = useLanguage();
  const [viewMode, setViewMode] = useState<"clinical" | "personal">("clinical");
  const user = getUser();
  const userRoles: RoleName[] = user?.roles ?? [];
  const primaryRole = userRoles[0] ?? "patient";

  const isDoctor = userRoles.includes("doctor");
  const hasPatientId = !!user?.patient_id;
  const showDualToggle = isDoctor && hasPatientId;

  const isPatientRole = primaryRole === "patient" || (viewMode === "personal" && hasPatientId);

  const visibleNavItems = (() => {
    // Doctor with dual mode gets two distinct sidebars:
    // - Clinical: doctor menu but without Doctors/Labs
    // - Personal: patient-style menu
    if (showDualToggle) {
      if (viewMode === "personal") {
        const ownPatientId = user?.patient_id;
        return navItems
          .filter((item) => item.roles.includes("patient"))
          .map((item) =>
            item.href === "/patients" && ownPatientId
              ? { ...item, href: `/patients/${ownPatientId}` }
              : item
          );
      }
      return navItems.filter(
        (item) =>
          item.roles.includes("doctor") &&
          item.href !== "/doctors" &&
          item.href !== "/labs"
      );
    }
    return navItems.filter((item) =>
      userRoles.some((role) => item.roles.includes(role))
    );
  })();


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
    <div className="min-h-screen bg-background">
      {/* ── Header ── */}
      <header
        className="sticky top-0 z-40 border-b border-border/50"
        style={{ background: "var(--card)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}
      >
        <div className="mx-auto flex max-w-[1440px] items-center justify-between px-4 py-3 lg:px-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--gradient-start)] to-[var(--gradient-end)] shadow-lg shadow-primary/20">
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
                className="bg-transparent text-xs font-medium outline-none cursor-pointer"
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

            {false && showDualToggle && (
              <div className="flex items-center gap-1 rounded-full bg-slate-100 p-1 mr-4">
                <button
                  onClick={() => setViewMode("clinical")}
                  className={`px-3 py-1 text-xs font-bold rounded-full transition ${viewMode === "clinical" ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                >
                  Clinical
                </button>
                <button
                  onClick={() => setViewMode("personal")}
                  className={`px-3 py-1 text-xs font-bold rounded-full transition ${viewMode === "personal" ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-emerald-500"}`}
                >
                  Personal
                </button>
              </div>
            )}

            <div className="text-sm font-medium text-muted">{user?.username ?? tr("unknownUser")}</div>
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

      <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-0 md:grid-cols-[260px_1fr]">
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
                isPatient={isPatientRole}
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
            <SidebarContent items={visibleNavItems} pathname={pathname} tr={tr} isPatient={isPatientRole} />
          </div>
        </aside>

        <main className="min-w-0 p-4 lg:p-6">{children}</main>
      </div>
    </div >
  );
}

function SidebarContent({
  items,
  pathname,
  tr,
  isPatient,
  onNav,
}: {
  items: NavItem[];
  pathname: string;
  tr: (key: string) => string;
  isPatient?: boolean;
  onNav?: () => void;
}) {
  return (
    <nav className="space-y-1">
      {items.map((item) => {
        const active = pathname === item.href || pathname?.startsWith(item.href + "/");
        const Icon = item.icon;
        const label = isPatient && item.patientKey ? tr(item.patientKey) : tr(item.key);
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
              className={`relative z-10 transition-colors duration-200 ${active ? "text-white" : isPatient && item.patientKey ? "text-emerald-500 group-hover:text-emerald-600" : "text-muted group-hover:text-primary"
                }`}
            />
            <span
              className={`relative z-10 font-medium transition-colors duration-200 ${active ? "text-white" : isPatient && item.patientKey ? "text-emerald-600 group-hover:text-emerald-700" : "text-foreground group-hover:text-primary"
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
