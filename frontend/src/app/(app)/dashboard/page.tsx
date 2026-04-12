"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Activity, FlaskConical, Dna, Lightbulb, Users, Stethoscope,
  BarChart3, UserPlus, CalendarDays, Upload, Brain, GitBranch,
  Building2, ArrowRight, TrendingUp, AlertTriangle, CheckCircle,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/lib/api-client";
import { StatCard } from "@/components/ui/StatCard";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { PageHeader } from "@/components/ui/PageHeader";
import { getUser } from "@/lib/auth-store";
import { useLanguage } from "@/components/providers/LanguageProvider";
import { translateDynamicTexts } from "@/lib/dynamic-translation";
import type { RoleName } from "@/lib/types";

type Patient = {
  patient_id: string;
  first_name: string;
  last_name: string;
  cnic: string;
  date_of_birth: string;
  gender: string;
  blood_group?: string;
  phone?: string;
  email?: string;
};

type ProgressionPoint = {
  date: string;
  progression_stage: string;
  severity_score: number;
};

type RiskAssessment = {
  status: string;
  message: string;
  ancestors_count?: number;
  ancestors_with_diseases_count?: number;
};

type LabMeasurement = {
  date: string;
  value: number;
  is_abnormal: boolean;
};

type LabTimeline = {
  measurements?: Record<string, {
    data_points: LabMeasurement[];
    unit?: string | null;
    reference_range_min?: number | null;
    reference_range_max?: number | null;
  }>;
};

type Recommendations = {
  recommendations?: string[];
  next_steps?: string[];
};

type DiseaseStatus = {
  disease: string;
  disease_label?: string;
  latest_stage: string;
  severity: number;
};

type QuickAction = { labelKey: string; href: string; icon: LucideIcon; roles: RoleName[] };

const quickActions: QuickAction[] = [
  { labelKey: "registerPatient", href: "/patients", icon: UserPlus, roles: ["admin"] },
  { labelKey: "createVisit", href: "/visits", icon: CalendarDays, roles: ["admin", "doctor"] },
  { labelKey: "uploadLabReport", href: "/labs", icon: Upload, roles: ["admin", "lab", "doctor"] },
  { labelKey: "viewReports", href: "/reports", icon: BarChart3, roles: ["admin", "doctor", "patient"] },
  { labelKey: "familyTree", href: "/family", icon: GitBranch, roles: ["admin", "doctor", "patient"] },
  { labelKey: "manageDoctors", href: "/doctors", icon: Building2, roles: ["admin"] },
];


function computeAge(dob: string): number {
  const birth = new Date(dob);
  const diff = Date.now() - birth.getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}

function stageToSeverity(stage: string): number {
  const s = stage.toLowerCase();
  if (s.includes("normal") || s.includes("stable") || s.includes("controlled")) return 15;
  if (s.includes("mild") || s.includes("pre") || s.includes("early")) return 35;
  if (s.includes("moderate")) return 55;
  if (s.includes("severe") || s.includes("advanced") || s.includes("stage 4") || s.includes("stage 5")) return 90;
  if (s.includes("high") || s.includes("stage 3")) return 70;
  return 50;
}

const DISEASES = ["diabetes", "anemia", "ckd", "parathyroid", "oral_cancer"];

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

export default function DashboardPage() {
  const router = useRouter();
  const { tr, language } = useLanguage();
  const [localViewMode, setLocalViewMode] = useState<"clinical" | "personal">("clinical");
  const user = getUser();
  const userRoles: RoleName[] = (user?.roles ?? []) as RoleName[];
  const primaryRole = userRoles[0] ?? "patient";
  const patientId = user?.patient_id;
  const isDoctor = userRoles.includes("doctor");
  const isPatient = primaryRole === "patient" || (localViewMode === "personal" && !!patientId);


  const [profile, setProfile] = useState<Patient | null>(null);
  const [diseases, setDiseases] = useState<DiseaseStatus[]>([]);
  const [risk, setRisk] = useState<RiskAssessment | null>(null);
  const [recs, setRecs] = useState<string[]>([]);
  const [recentLabs, setRecentLabs] = useState<{ test: string; value: number; unit: string; abnormal: boolean }[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [stats, setStats] = useState({ patients: 0, doctors: 0, labs: 0, reports: 0 });
  const [error, setError] = useState<string | null>(null);

  const visibleActions = quickActions.filter((a) => userRoles.some((r) => a.roles.includes(r)));

  useEffect(() => {
    if (isPatient && patientId) {
      loadPatientDashboard(patientId);
    } else {
      loadAdminStats();
    }
  }, [isPatient, patientId, language]);


  async function loadPatientDashboard(pid: string) {
    try {
      const [profileData, riskData, recsData, labData, ...diseaseTimelines] = await Promise.all([
        api.request<Patient>(`/patients/${pid}`).catch(() => null),
        api.request<RiskAssessment>(`/reports/patient/${pid}/risk-assessment`).catch(() => null),
        api.request<Recommendations>(`/reports/patient/${pid}/recommendations`).catch(() => null),
        api.request<LabTimeline>(`/reports/patient/${pid}/lab-measurements-timeline?months_back=12`).catch(() => null),
        ...DISEASES.map((d) =>
          api.request<ProgressionPoint[]>(
            `/reports/patient/${pid}/progression-timeline?disease_name=${d}&months_back=12`
          ).catch(() => [] as ProgressionPoint[])
        ),
      ]);

      const recList = recsData?.recommendations ?? recsData?.next_steps ?? [];
      const labs: typeof recentLabs = [];
      if (labData?.measurements) {
        for (const [testName, info] of Object.entries(labData.measurements)) {
          const pts = info.data_points;
          if (pts.length > 0) {
            const latest = pts[pts.length - 1];
            labs.push({ test: testName, value: latest.value, unit: info.unit ?? "", abnormal: latest.is_abnormal });
          }
        }
      }

      const dList: DiseaseStatus[] = [];
      DISEASES.forEach((d, i) => {
        const timeline = diseaseTimelines[i] as ProgressionPoint[];
        if (timeline && timeline.length > 0) {
          const latest = timeline[timeline.length - 1];
          dList.push({
            disease: d,
            latest_stage: latest.progression_stage,
            severity: latest.severity_score ?? stageToSeverity(latest.progression_stage),
          });
        }
      });

      const textsToTranslate = [
        ...dList.map((d) => d.disease),
        ...dList.map((d) => d.latest_stage),
        ...labs.slice(0, 6).map((l) => l.test),
        ...(riskData?.message ? [riskData.message] : []),
        ...recList,
      ];
      const translated = await translateDynamicTexts(textsToTranslate, language);
      const trText = (value: string) => translated[value] ?? value;

      if (profileData) setProfile(profileData);
      if (riskData) setRisk({ ...riskData, message: trText(riskData.message) });
      setRecs(recList.map((r) => trText(r)));
      setRecentLabs(labs.slice(0, 6).map((l) => ({ ...l, test: trText(l.test) })));
      setDiseases(
        dList.map((d) => ({
          ...d,
          disease: d.disease,
          disease_label: trText(d.disease),
          latest_stage: trText(d.latest_stage),
        }))
      );
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("failedToLoadDashboard"));
      setLoaded(true);
    }
  }

  async function loadAdminStats() {
    try {
      type PatientArr = { patient_id: string }[];
      type DoctorArr = { patient_id: string }[];
      const [p, d] = await Promise.all([
        api.request<PatientArr>("/patients?skip=0&limit=1").then((r) => r.length).catch(() => 0),
        api.request<DoctorArr>("/doctors?skip=0&limit=1").then((r) => r.length).catch(() => 0),
      ]);
      setStats({ patients: p, doctors: d, labs: 0, reports: 0 });
    } catch {
      // silently fail
    }
    setLoaded(true);
  }

  /* ═══ PATIENT DASHBOARD ═══ */
  if (isPatient) {
    if (!loaded) {
      return (
        <div className="flex items-center justify-center h-[60vh]">
          <div className="flex flex-col items-center gap-3">
            <Activity size={32} className="animate-spin text-primary" />
            <span className="text-sm text-muted">{tr("loadingHealthDashboard")}</span>
          </div>
        </div>
      );
    }

    return (
      <motion.div className="mx-auto w-full max-w-6xl space-y-10 px-2 sm:px-8 xl:px-0 py-8 bg-gradient-to-br from-[#181f2a] via-[#1a2233] to-[#232b3e] min-h-[90vh] rounded-3xl shadow-2xl" initial="hidden" animate="show" variants={stagger}>
        {/* Hero Card */}
        <motion.div variants={fadeUp} className="backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl shadow-lg p-10">
          <div className="relative z-10 flex flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-base text-blue-200 font-semibold tracking-wide mb-1 flex items-center gap-2">
                <Activity size={18} className="inline-block text-blue-400" /> {tr("welcomeBack")}
              </p>
              <h1 className="text-3xl font-extrabold text-white drop-shadow-lg">
                {profile ? `${profile.first_name} ${profile.last_name}` : user?.username ?? tr("patients")}
              </h1>
              <p className="mt-2 text-lg text-blue-100 font-medium">{tr("personalHealthDashboard")}</p>
              {isDoctor && (
                <button
                  onClick={() => setLocalViewMode("clinical")}
                  className="mt-5 flex items-center gap-2 text-sm font-bold text-blue-200 hover:text-white transition-colors"
                >
                  <ArrowRight size={16} className="rotate-180" /> {tr("backToClinicalDashboard")}
                </button>
              )}
            </div>

            <div className="flex flex-col gap-3 items-start sm:items-end">
            {profile && (
              <div className="flex gap-8 text-white/90">
                <div className="flex flex-col items-center">
                  <div className="text-3xl font-extrabold drop-shadow-md">{computeAge(profile.date_of_birth)}</div>
                  <div className="text-xs text-blue-200 mt-1">{tr("age")}</div>
                </div>
                <div className="flex flex-col items-center">
                  <div className="text-3xl font-extrabold drop-shadow-md">{profile.blood_group ?? "—"}</div>
                  <div className="text-xs text-blue-200 mt-1">{tr("blood")}</div>
                </div>
                <div className="flex flex-col items-center">
                  <div className="text-3xl font-extrabold capitalize drop-shadow-md">{profile.gender}</div>
                  <div className="text-xs text-blue-200 mt-1">{tr("gender")}</div>
                </div>
              </div>
            )}
            </div>
          </div>
        </motion.div>

        {error && <div className="alert-error">{error}</div>}

        {/* Disease Progress Cards */}
        {diseases.length > 0 && (
          <motion.div variants={fadeUp} className="card p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
              <TrendingUp size={20} className="text-primary" />
              <span className="gradient-text">{tr("activeConditions")}</span>
            </h2>
            <div className="space-y-4">
              {diseases.map((d) => (
                <div key={d.disease} className="rounded-xl border border-border p-4 transition-colors hover:border-primary/30">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold capitalize">{(d.disease_label ?? d.disease).replace(/_/g, " ")}</span>
                      <span className="badge bg-primary/10 text-primary">{d.latest_stage}</span>
                    </div>
                    <button
                      className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      onClick={() => router.push(`/reports?disease=${d.disease}`)}
                    >
                      {tr("viewTimeline")} <ArrowRight size={12} />
                    </button>
                  </div>
                  <ProgressBar value={d.severity} label={tr("severityScore")} />
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Recent Lab Results */}
        {recentLabs.length > 0 && (
          <motion.div variants={fadeUp} className="card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <FlaskConical size={20} className="text-primary" />
                <span className="gradient-text">{tr("latestLabResults")}</span>
              </h2>
              <button
                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                onClick={() => router.push("/labs")}
              >
                {tr("viewAll")} <ArrowRight size={12} />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {recentLabs.map((lab) => (
                <div
                  key={lab.test}
                  className={`rounded-xl border p-3 transition-all hover:shadow-md ${lab.abnormal ? "border-danger/30 bg-danger/5" : "border-success/30 bg-success/5"
                    }`}
                >
                  <div className="text-xs text-muted capitalize">{lab.test.replace(/_/g, " ")}</div>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="text-xl font-bold tabular-nums">{lab.value}</span>
                    <span className="text-xs text-muted">{lab.unit}</span>
                  </div>
                  <div className="mt-1">
                    {lab.abnormal ? (
                      <span className="badge bg-danger/15 text-danger">
                        <AlertTriangle size={10} /> {tr("abnormal")}
                      </span>
                    ) : (
                      <span className="badge bg-success/15 text-success">
                        <CheckCircle size={10} /> {tr("normal")}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Family Risk + Recommendations */}
        <motion.div variants={fadeUp} className="grid grid-cols-1 gap-6 items-stretch">
          <div className="card p-6 flex flex-col h-full">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
              <Dna size={20} className="text-primary" />
              <span className="gradient-text">{tr("hereditaryRisk")}</span>
            </h2>
            {risk ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">
                  {risk.message}
                </div>
                {risk.ancestors_count != null && (
                  <div className="grid grid-cols-1 gap-3">
                    <div className="rounded-xl border border-border bg-background p-3">
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-muted">{tr("relativesAnalyzed")}</div>
                        <div className="text-xl font-bold tabular-nums">{risk.ancestors_count}</div>
                      </div>
                    </div>
                    <div className="rounded-xl border border-warning/30 bg-warning/5 p-3">
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-muted">{tr("withConditions")}</div>
                        <div className="text-xl font-bold tabular-nums text-warning">{risk.ancestors_with_diseases_count ?? 0}</div>
                      </div>
                    </div>
                  </div>
                )}
                <button className="btn-primary w-full text-sm" onClick={() => router.push("/family")}>
                  <GitBranch size={16} /> {tr("viewFamilyTree")}
                </button>
              </div>
            ) : (
              <p className="text-sm text-muted">{tr("noFamilyRiskData")}</p>
            )}
          </div>

          <div className="card p-6 flex flex-col h-full">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
              <Lightbulb size={20} className="text-primary" />
              <span className="gradient-text">{tr("aiRecommendations")}</span>
            </h2>
            {recs.length > 0 ? (
              <ul className="space-y-3">
                {recs.slice(0, 5).map((r, i) => (
                  <li key={i} className="flex items-start gap-3 rounded-xl border border-border bg-background p-3 text-sm transition-all hover:border-primary/30 hover:bg-primary/5">
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {i + 1}
                    </div>
                    <span className="leading-relaxed">{r}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">
                {tr("aiRecommendationsPlaceholder")}
              </p>
            )}
          </div>
        </motion.div>

      </motion.div>
    );
  }

  /* ═══ ADMIN / DOCTOR / LAB DASHBOARD ═══ */
  const roleGreetings: Record<string, string> = {
    admin: tr("systemAdministrator"),
    doctor: tr("healthcareProvider"),
    lab: tr("laboratoryPortal"),
  };

  return (
    <motion.div className="space-y-5" initial="hidden" animate="show" variants={stagger}>
      <motion.div variants={fadeUp} className="card-gradient p-6">
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-sm text-white/70">{roleGreetings[primaryRole] ?? tr("welcome")}</p>
            <h1 className="text-2xl font-bold">{user?.username ?? tr("unknownUser")}</h1>
            <p className="mt-1 text-sm text-white/60">
              {tr("manageClinicalRecords")}
            </p>
          </div>
          {isDoctor && patientId && (
            <button
              onClick={() => setLocalViewMode("personal")}
              className="btn-ghost bg-white/10 hover:bg-white/20 text-white text-sm border border-white/20"
            >
              <Activity size={16} className="mr-2" />
              {tr("switchToMyHealth")}
            </button>
          )}
        </div>

      </motion.div>

      {error && <div className="alert-error">{error}</div>}

      <motion.div variants={fadeUp} className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {userRoles.some((r) => ["admin", "doctor"].includes(r)) && (
          <>
            <StatCard title={tr("patients")} value={stats.patients} subtitle={tr("registeredRecords")} icon={<Users size={20} />} />
            <StatCard title={tr("doctors")} value={stats.doctors} subtitle={tr("activeProviders")} icon={<Stethoscope size={20} />} />
          </>
        )}
        {userRoles.some((r) => ["admin", "lab", "doctor"].includes(r)) && (
          <StatCard title={tr("labs")} value={stats.labs} subtitle={tr("connectedLabs")} icon={<FlaskConical size={20} />} />
        )}
        <StatCard title={tr("reports")} value={stats.reports} subtitle={tr("labReportsCount")} icon={<BarChart3 size={20} />} />
      </motion.div>

      <motion.div variants={fadeUp} className="card p-5">
        <h2 className="mb-4 text-lg font-semibold">{tr("quickActions")}</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {visibleActions.map((a) => {
            const Icon = a.icon;
            return (
              <motion.button
                key={a.labelKey}
                className="btn-ghost flex items-center gap-2.5 text-sm"
                onClick={() => router.push(a.href)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon size={16} />
                </div>
                {tr(a.labelKey)}
              </motion.button>
            );
          })}
        </div>
      </motion.div>
    </motion.div>
  );
}
