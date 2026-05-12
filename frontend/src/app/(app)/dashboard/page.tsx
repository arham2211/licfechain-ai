"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Activity, FlaskConical, Dna, Lightbulb, Stethoscope,
  GitBranch, ArrowRight, TrendingUp, AlertTriangle, CheckCircle,
  BadgeCheck, Phone, Mail, CreditCard, Building2, User, Droplets, MapPin,
  BarChart3, ShieldCheck, CalendarRange, UsersRound, ClipboardList, HeartPulse,
} from "lucide-react";
import { api } from "@/lib/api-client";
import { ProgressBar } from "@/components/ui/ProgressBar";
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

type LabFacility = {
  lab_id: string;
  lab_name: string;
  lab_location?: string;
  accreditation_number?: string;
  phone?: string;
  email?: string;
};

type DoctorProfile = {
  patient_id?: string;
  first_name: string;
  last_name: string;
  cnic?: string;
  date_of_birth?: string;
  gender?: string;
  blood_group?: string;
  phone?: string;
  email?: string;
  address?: string;
  specialization?: string;
  license_number?: string;
  hospital_affiliation?: string;
};

type DoctorListItem = {
  patient_id: string;
  first_name: string;
  last_name: string;
  specialization?: string;
  hospital_affiliation?: string;
};

type VisitListItem = {
  visit_id: string;
  patient_id: string;
  doctor_patient_id: string;
  visit_type: string;
  visit_date: string;
};

type LabReportListItem = {
  report_id: string;
  report_type: string;
  status: string;
  report_date: string;
  patient_id: string;
  lab_id: string;
};

type AdminDashboardMetrics = {
  totalPatients: number;
  totalDoctors: number;
  totalLabs: number;
  totalVisits: number;
  totalReports: number;
  completedReports: number;
  pendingReports: number;
  uniquePatientVisits: number;
  recentVisits: number;
  recentReports: number;
  averageVisitsPerPatient: number;
  completionRate: number;
};

type AdminDashboardData = {
  metrics: AdminDashboardMetrics;
  patientGenderMix: Array<{ label: string; value: number }>;
  visitsByType: Array<{ label: string; value: number }>;
  reportsByStatus: Array<{ label: string; value: number }>;
  reportsByType: Array<{ label: string; value: number }>;
  leadingLabs: Array<{ id: string; label: string; value: number; subtitle: string }>;
  leadingSpecialties: Array<{ label: string; value: number }>;
  activityFeed: Array<{ title: string; subtitle: string; meta: string }>;
};

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

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function daysBetweenNow(dateString: string): number {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY;
  return (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
}

function formatShortDate(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function accumulateCounts<T extends string>(items: T[]): Array<{ label: string; value: number }> {
  const counts = new Map<string, number>();
  items.forEach((item) => {
    counts.set(item, (counts.get(item) ?? 0) + 1);
  });
  return Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

function prettifyLabel(label: string): string {
  return label
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildAdminDashboardData(
  patients: Patient[],
  doctors: DoctorListItem[],
  labs: LabFacility[],
  visits: VisitListItem[],
  reports: LabReportListItem[]
): AdminDashboardData {
  const uniqueVisitedPatients = new Set(visits.map((visit) => visit.patient_id)).size;
  const completedReports = reports.filter((report) => report.status === "completed").length;
  const pendingReports = reports.filter((report) => report.status !== "completed").length;
  const recentVisits = visits.filter((visit) => daysBetweenNow(visit.visit_date) <= 30).length;
  const recentReports = reports.filter((report) => daysBetweenNow(report.report_date) <= 30).length;
  const genderMix = accumulateCounts(
    patients.map((patient) => (patient.gender || "unknown").toLowerCase())
  ).map((entry) => ({ ...entry, label: prettifyLabel(entry.label) }));
  const visitsByType = accumulateCounts(
    visits.map((visit) => visit.visit_type || "unspecified")
  ).map((entry) => ({ ...entry, label: prettifyLabel(entry.label) }));
  const reportsByStatus = accumulateCounts(
    reports.map((report) => report.status || "unknown")
  ).map((entry) => ({ ...entry, label: prettifyLabel(entry.label) }));
  const reportsByType = accumulateCounts(
    reports.map((report) => report.report_type || "unknown")
  )
    .slice(0, 6)
    .map((entry) => ({ ...entry, label: prettifyLabel(entry.label) }));
  const labUsageCounts = new Map<string, number>();
  reports.forEach((report) => {
    labUsageCounts.set(report.lab_id, (labUsageCounts.get(report.lab_id) ?? 0) + 1);
  });
  const leadingLabs = labs
    .map((lab) => ({
      id: lab.lab_id,
      label: lab.lab_name,
      value: labUsageCounts.get(lab.lab_id) ?? 0,
      subtitle: lab.lab_location || lab.email || "Operational lab",
    }))
    .filter((lab) => lab.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
  const leadingSpecialties = accumulateCounts(
    doctors.map((doctor) => doctor.specialization || "general practice")
  )
    .slice(0, 5)
    .map((entry) => ({ ...entry, label: prettifyLabel(entry.label) }));

  const activityFeed = [
    ...reports.map((report) => ({
      title: `${prettifyLabel(report.report_type)} report`,
      subtitle: `${prettifyLabel(report.status)} for patient ${report.patient_id.slice(0, 8)}`,
      meta: formatShortDate(report.report_date),
      sortTime: new Date(report.report_date).getTime(),
    })),
    ...visits.map((visit) => ({
      title: `${prettifyLabel(visit.visit_type)} visit`,
      subtitle: `Patient ${visit.patient_id.slice(0, 8)} with doctor ${visit.doctor_patient_id.slice(0, 8)}`,
      meta: formatShortDate(visit.visit_date),
      sortTime: new Date(visit.visit_date).getTime(),
    })),
  ]
    .sort((a, b) => b.sortTime - a.sortTime)
    .slice(0, 6);

  return {
    metrics: {
      totalPatients: patients.length,
      totalDoctors: doctors.length,
      totalLabs: labs.length,
      totalVisits: visits.length,
      totalReports: reports.length,
      completedReports,
      pendingReports,
      uniquePatientVisits: uniqueVisitedPatients,
      recentVisits,
      recentReports,
      averageVisitsPerPatient: patients.length > 0 ? visits.length / patients.length : 0,
      completionRate: reports.length > 0 ? (completedReports / reports.length) * 100 : 0,
    },
    patientGenderMix: genderMix,
    visitsByType,
    reportsByStatus,
    reportsByType,
    leadingLabs,
    leadingSpecialties,
    activityFeed,
  };
}

const DISEASES = ["diabetes", "anemia", "ckd", "parathyroid", "oral_cancer"];

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } };
const fadeUp = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

export default function DashboardPage() {
  const router = useRouter();
  const { tr, language } = useLanguage();
  const user = getUser();
  const userRoles: RoleName[] = (user?.roles ?? []) as RoleName[];
  const primaryRole = userRoles[0] ?? "patient";
  const patientId = user?.patient_id;
  const isDoctor = userRoles.includes("doctor");
  const isPatient = primaryRole === "patient";
  const isLab = primaryRole === "lab";
  const isAdmin = primaryRole === "admin";

  const [profile, setProfile] = useState<Patient | null>(null);
  const [diseases, setDiseases] = useState<DiseaseStatus[]>([]);
  const [risk, setRisk] = useState<RiskAssessment | null>(null);
  const [recs, setRecs] = useState<string[]>([]);
  const [recentLabs, setRecentLabs] = useState<{ test: string; value: number; unit: string; abnormal: boolean }[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doctorProfile, setDoctorProfile] = useState<DoctorProfile | null>(null);
  const [doctorLoading, setDoctorLoading] = useState(false);
  const [labFacility, setLabFacility] = useState<LabFacility | null>(null);
  const [adminData, setAdminData] = useState<AdminDashboardData | null>(null);

  useEffect(() => {
    if (isPatient && patientId) {
      loadPatientDashboard(patientId);
    } else if (isAdmin) {
      loadAdminDashboard();
    } else if (isDoctor && patientId) {
      setDoctorLoading(true);
      api.request<DoctorProfile>(`/doctors/${patientId}`)
        .then((data) => { setDoctorProfile(data); setDoctorLoading(false); })
        .catch(() => { setDoctorProfile(null); setDoctorLoading(false); });
      setLoaded(true);
    } else if (isLab) {
      api.request<LabFacility[]>("/labs")
        .then((allLabs) => {
          const userEmail = (user?.email ?? "").toLowerCase();
          const matched = allLabs.find((l) => (l.email ?? "").toLowerCase() === userEmail) ?? null;
          setLabFacility(matched);
        })
        .catch(() => setLabFacility(null))
        .finally(() => setLoaded(true));
    } else {
      setLoaded(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPatient, patientId, isDoctor, isLab, isAdmin, language]);

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

  async function loadAdminDashboard() {
    try {
      const [patients, doctors, labs, visits, reports] = await Promise.all([
        api.request<Patient[]>("/patients?skip=0&limit=500").catch(() => [] as Patient[]),
        api.request<DoctorListItem[]>("/doctors?skip=0&limit=500").catch(() => [] as DoctorListItem[]),
        api.request<LabFacility[]>("/labs?skip=0&limit=500").catch(() => [] as LabFacility[]),
        api.request<VisitListItem[]>("/visits?skip=0&limit=1000").catch(() => [] as VisitListItem[]),
        api.request<LabReportListItem[]>("/labs/reports?skip=0&limit=1000").catch(() => [] as LabReportListItem[]),
      ]);

      setAdminData(buildAdminDashboardData(patients, doctors, labs, visits, reports));
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("failedToLoadDashboard"));
      setLoaded(true);
    }
  }

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

  /* ═══ PATIENT DASHBOARD ═══ */
  if (isPatient) {
    return (
      <motion.div className="mx-auto w-full max-w-6xl space-y-8 px-1 sm:px-4 xl:px-0 py-2" initial="hidden" animate="show" variants={stagger}>
        {/* Hero Card */}
        <motion.div variants={fadeUp} className="relative overflow-hidden rounded-[32px] border border-white/80 bg-white/72 p-8 shadow-[0_30px_90px_rgba(2,132,199,0.14)] backdrop-blur-2xl md:p-10">
          <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-primary-500 via-cyan-400 to-sky-300 opacity-90" />
          <div className="absolute -top-24 right-0 h-72 w-72 rounded-full bg-primary-100/55 blur-[100px]" />
          <div className="absolute -bottom-20 left-0 h-64 w-64 rounded-full bg-cyan-100/60 blur-[100px]" />
          <div className="relative z-10 flex flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold tracking-[0.18em] text-primary uppercase">
                <Activity size={18} className="inline-block text-primary" /> {tr("welcomeBack")}
              </p>
              <h1 className="text-3xl font-extrabold text-slate-900">
                {profile ? `${profile.first_name} ${profile.last_name}` : user?.username ?? tr("patients")}
              </h1>
              <p className="mt-2 text-lg font-medium text-slate-600">{tr("personalHealthDashboard")}</p>
            </div>
            {profile && (
              <div className="flex gap-4 text-slate-900 sm:gap-8">
                <div className="flex flex-col items-center">
                  <div className="rounded-2xl border border-primary/10 bg-primary/5 px-5 py-4 text-3xl font-extrabold shadow-sm">{computeAge(profile.date_of_birth)}</div>
                  <div className="mt-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">{tr("age")}</div>
                </div>
                <div className="flex flex-col items-center">
                  <div className="rounded-2xl border border-cyan-500/10 bg-cyan-50 px-5 py-4 text-3xl font-extrabold shadow-sm">{profile.blood_group ?? "—"}</div>
                  <div className="mt-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">{tr("blood")}</div>
                </div>
                <div className="flex flex-col items-center">
                  <div className="rounded-2xl border border-sky-500/10 bg-sky-50 px-5 py-4 text-3xl font-extrabold capitalize shadow-sm">{profile.gender}</div>
                  <div className="mt-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">{tr("gender")}</div>
                </div>
              </div>
            )}
          </div>
        </motion.div>

        {error && <div className="alert-error">{error}</div>}

        {/* Active Conditions */}
        {diseases.length > 0 && (
          <motion.div variants={fadeUp} className="card border-white/70 bg-white/78 p-6 shadow-[0_20px_60px_rgba(2,132,199,0.08)] backdrop-blur-xl">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
              <TrendingUp size={20} className="text-primary" />
              <span className="gradient-text">{tr("activeConditions")}</span>
            </h2>
            <div className="space-y-4">
              {diseases.map((d) => (
                <div key={d.disease} className="rounded-xl border border-white/80 bg-white/80 p-4 shadow-sm transition-colors hover:border-primary/30">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold capitalize text-slate-900">{(d.disease_label ?? d.disease).replace(/_/g, " ")}</span>
                      <span className="badge border border-primary/20 bg-primary/12 text-primary-700">{d.latest_stage}</span>
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
          <motion.div variants={fadeUp} className="card border-white/70 bg-white/78 p-6 shadow-[0_20px_60px_rgba(2,132,199,0.08)] backdrop-blur-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <FlaskConical size={20} className="text-primary" />
                <span className="gradient-text">{tr("latestLabResults")}</span>
              </h2>
              <button className="flex items-center gap-1 text-xs font-medium text-primary hover:underline" onClick={() => router.push("/labs")}>
                {tr("viewAll")} <ArrowRight size={12} />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {recentLabs.map((lab) => (
                <div
                  key={lab.test}
                  className={`rounded-xl border p-3 transition-all hover:shadow-md ${lab.abnormal ? "border-danger/30 bg-danger/5" : "border-primary/20 bg-primary/5"}`}
                >
                  <div className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">{lab.test.replace(/_/g, " ")}</div>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="text-2xl font-extrabold tabular-nums text-slate-900">{lab.value}</span>
                    <span className="text-xs font-medium text-slate-600">{lab.unit}</span>
                  </div>
                  <div className="mt-1">
                    {lab.abnormal ? (
                      <span className="badge bg-danger/15 text-danger"><AlertTriangle size={10} /> {tr("abnormal")}</span>
                    ) : (
                      <span className="badge bg-primary/15 text-primary"><CheckCircle size={10} /> {tr("normal")}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Family Risk + Recommendations */}
        <motion.div variants={fadeUp} className="grid grid-cols-1 gap-6 items-stretch">
          <div className="card border-white/70 bg-white/78 p-6 flex flex-col h-full shadow-[0_20px_60px_rgba(2,132,199,0.08)] backdrop-blur-xl">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
              <Dna size={20} className="text-primary" />
              <span className="gradient-text">{tr("hereditaryRisk")}</span>
            </h2>
            {risk ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm font-medium text-slate-800">{risk.message}</div>
                {risk.ancestors_count != null && (
                  <div className="grid grid-cols-1 gap-3">
                    <div className="rounded-xl border border-white/80 bg-white/85 p-3 shadow-sm">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium text-slate-600">{tr("relativesAnalyzed")}</div>
                        <div className="text-xl font-bold tabular-nums text-slate-900">{risk.ancestors_count}</div>
                      </div>
                    </div>
                    <div className="rounded-xl border border-warning/30 bg-warning/5 p-3">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium text-slate-700">{tr("withConditions")}</div>
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

          <div className="card border-white/70 bg-white/78 p-6 flex flex-col h-full shadow-[0_20px_60px_rgba(2,132,199,0.08)] backdrop-blur-xl">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
              <Lightbulb size={20} className="text-primary" />
              <span className="gradient-text">{tr("aiRecommendations")}</span>
            </h2>
            {recs.length > 0 ? (
              <ul className="space-y-3">
                {recs.slice(0, 5).map((r, i) => (
                  <li key={i} className="flex items-start gap-3 rounded-xl border border-white/80 bg-white/85 p-3 text-sm shadow-sm transition-all hover:border-primary/30 hover:bg-primary/5">
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{i + 1}</div>
                    <span className="leading-relaxed text-slate-800">{r}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">{tr("aiRecommendationsPlaceholder")}</p>
            )}
          </div>
        </motion.div>
      </motion.div>
    );
  }

  /* ═══ DOCTOR / ADMIN / LAB DASHBOARD ═══ */
  const roleGreetings: Record<string, string> = {
    admin: tr("systemAdministrator"),
    doctor: tr("healthcareProvider"),
    lab: tr("laboratoryPortal"),
  };
  const dashboardDisplayName =
    isDoctor && doctorProfile
      ? `${doctorProfile.first_name} ${doctorProfile.last_name}`
      : isLab && labFacility
      ? labFacility.lab_name
      : user?.username ?? tr("unknownUser");

  if (isAdmin && adminData) {
    const kpis = [
      {
        label: "Patients",
        value: adminData.metrics.totalPatients,
        detail: `${adminData.metrics.uniquePatientVisits} active in visits`,
        icon: <UsersRound size={20} />,
        accent: "from-cyan-500 to-sky-500",
      },
      {
        label: "Doctors",
        value: adminData.metrics.totalDoctors,
        detail: `${adminData.leadingSpecialties.length} lead specialties`,
        icon: <Stethoscope size={20} />,
        accent: "from-emerald-500 to-teal-500",
      },
      {
        label: "Labs",
        value: adminData.metrics.totalLabs,
        detail: `${adminData.metrics.recentReports} reports this month`,
        icon: <FlaskConical size={20} />,
        accent: "from-fuchsia-500 to-violet-500",
      },
      {
        label: "Visits",
        value: adminData.metrics.totalVisits,
        detail: `${adminData.metrics.recentVisits} in last 30 days`,
        icon: <CalendarRange size={20} />,
        accent: "from-amber-400 to-orange-500",
      },
    ];

    return (
      <motion.div className="space-y-6" initial="hidden" animate="show" variants={stagger}>
        <motion.section
          variants={fadeUp}
          className="relative overflow-hidden rounded-[34px] border border-white/80 bg-white/78 px-6 py-7 shadow-[0_30px_90px_rgba(2,132,199,0.14)] backdrop-blur-2xl sm:px-8"
        >
          <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-primary-500 via-cyan-400 to-sky-300 opacity-90" />
          <div className="absolute -top-24 right-0 h-72 w-72 rounded-full bg-primary-100/55 blur-[100px]" />
          <div className="absolute -bottom-20 left-0 h-64 w-64 rounded-full bg-cyan-100/60 blur-[100px]" />
          <div className="relative z-10 grid gap-6 lg:grid-cols-[1.35fr_0.9fr]">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-primary">
                <ShieldCheck size={14} className="text-primary" />
                Executive Control Center
              </div>
              <h1 className="max-w-3xl text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
                Admin Dashboard
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                A live operational view across patients, providers, labs, visits, and report throughput built from the platform&apos;s current records.
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <ExecutiveStatCard
                  label="Report completion"
                  value={`${Math.round(adminData.metrics.completionRate)}%`}
                  detail={`${adminData.metrics.completedReports} of ${adminData.metrics.totalReports} closed`}
                />
                <ExecutiveStatCard
                  label="Average visit load"
                  value={adminData.metrics.averageVisitsPerPatient.toFixed(1)}
                  detail="Visits per patient"
                />
                <ExecutiveStatCard
                  label="Pending queue"
                  value={String(adminData.metrics.pendingReports)}
                  detail="Reports still in motion"
                />
              </div>
            </div>

            <div className="grid gap-3 rounded-[28px] border border-white/80 bg-white/72 p-4 shadow-[0_18px_50px_rgba(2,132,199,0.08)]">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">System Pulse</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">This month at a glance</div>
                </div>
                <div className="rounded-2xl bg-success/12 px-3 py-1 text-xs font-semibold text-success">
                  Stable network
                </div>
              </div>
              <PulseMeter
                label="Visit velocity"
                value={adminData.metrics.recentVisits}
                max={Math.max(adminData.metrics.totalVisits, adminData.metrics.recentVisits, 1)}
                color="bg-cyan-400"
              />
              <PulseMeter
                label="Report volume"
                value={adminData.metrics.recentReports}
                max={Math.max(adminData.metrics.totalReports, adminData.metrics.recentReports, 1)}
                color="bg-fuchsia-400"
              />
              <PulseMeter
                label="Lab capacity"
                value={adminData.leadingLabs.reduce((sum, lab) => sum + lab.value, 0)}
                max={Math.max(adminData.metrics.totalReports, 1)}
                color="bg-emerald-400"
              />
            </div>
          </div>
        </motion.section>

        {error && <div className="alert-error">{error}</div>}

        <motion.section variants={fadeUp} className="grid gap-4 xl:grid-cols-4">
          {kpis.map((kpi) => (
            <div
              key={kpi.label}
              className="group relative overflow-hidden rounded-[28px] border border-slate-200/70 bg-white/90 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl"
            >
              <div className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${kpi.accent}`} />
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">{kpi.label}</div>
                  <div className="mt-3 text-4xl font-black tracking-tight text-slate-950">{formatCompactNumber(kpi.value)}</div>
                  <div className="mt-2 text-sm text-slate-500">{kpi.detail}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-slate-700 transition group-hover:scale-105">
                  {kpi.icon}
                </div>
              </div>
            </div>
          ))}
        </motion.section>

        <motion.section variants={fadeUp} className="grid gap-4 xl:grid-cols-[1.25fr_0.95fr]">
          <PowerPanel
            title="Care Pathways"
            subtitle="Patient mix, visit demand, and reporting cadence"
            icon={<HeartPulse size={18} />}
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <MetricList
                title="Gender distribution"
                rows={adminData.patientGenderMix}
                tone="cyan"
              />
              <MetricList
                title="Visit types"
                rows={adminData.visitsByType}
                tone="violet"
              />
            </div>
          </PowerPanel>

          <PowerPanel
            title="Report Pipeline"
            subtitle="Status balance and top report categories"
            icon={<ClipboardList size={18} />}
          >
            <div className="space-y-4">
              <MetricList title="Status overview" rows={adminData.reportsByStatus} tone="emerald" compact />
              <MetricList title="Top report types" rows={adminData.reportsByType} tone="amber" compact />
            </div>
          </PowerPanel>
        </motion.section>

        <motion.section variants={fadeUp} className="grid gap-4 xl:grid-cols-[1fr_1fr]">
          <PowerPanel
            title="Top Performing Labs"
            subtitle="Facilities handling the most reporting load"
            icon={<FlaskConical size={18} />}
          >
            <Leaderboard
              rows={adminData.leadingLabs.map((lab) => ({
                id: lab.id,
                label: lab.label,
                value: lab.value,
                subtitle: lab.subtitle,
              }))}
              suffix="reports"
            />
          </PowerPanel>

          <PowerPanel
            title="Provider Mix"
            subtitle="Specialties currently shaping the care network"
            icon={<BarChart3 size={18} />}
          >
            <MetricList title="Lead specialties" rows={adminData.leadingSpecialties} tone="pink" />
          </PowerPanel>
        </motion.section>

        <motion.section variants={fadeUp}>
          <PowerPanel
            title="Recent Operations Feed"
            subtitle="Most recent report and visit activity entering the system"
            icon={<TrendingUp size={18} />}
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {adminData.activityFeed.map((item, index) => (
                <div
                  key={`${item.title}-${index}`}
                  className="rounded-2xl border border-slate-200/70 bg-slate-50/85 p-4 shadow-sm"
                >
                  <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">{item.meta}</div>
                  <div className="mt-2 text-base font-semibold text-slate-900">{item.title}</div>
                  <div className="mt-1 text-sm leading-6 text-slate-600">{item.subtitle}</div>
                </div>
              ))}
            </div>
          </PowerPanel>
        </motion.section>
      </motion.div>
    );
  }

  return (
    <motion.div className="space-y-5" initial="hidden" animate="show" variants={stagger}>
      <motion.div variants={fadeUp} className="card-gradient p-6">
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-sm text-white/70">{roleGreetings[primaryRole] ?? tr("welcome")}</p>
            <h1 className="text-2xl font-bold">{dashboardDisplayName}</h1>
            <p className="mt-1 text-sm text-white/60">{tr("manageClinicalRecords")}</p>
          </div>
        </div>
      </motion.div>

      {error && <div className="alert-error">{error}</div>}

      {/* Lab Facility Card */}
      {isLab && (
        <motion.div variants={fadeUp} className="card border-white/70 bg-white/78 p-6 shadow-[0_20px_60px_rgba(2,132,199,0.08)] backdrop-blur-xl">
          <h2 className="mb-5 flex items-center gap-2 text-lg font-semibold">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
              <FlaskConical size={15} className="text-primary" />
            </div>
            <span className="gradient-text">Lab Facility Details</span>
          </h2>
          {labFacility ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <DashDetailRow icon={<FlaskConical size={15} />} label="Lab Name" value={labFacility.lab_name} />
              {labFacility.lab_location && (
                <DashDetailRow icon={<MapPin size={15} />} label="Location" value={labFacility.lab_location} />
              )}
              {labFacility.accreditation_number && (
                <DashDetailRow icon={<BadgeCheck size={15} />} label="Accreditation" value={labFacility.accreditation_number} />
              )}
              {labFacility.phone && (
                <DashDetailRow icon={<Phone size={15} />} label={tr("phone")} value={labFacility.phone} />
              )}
              {labFacility.email && (
                <DashDetailRow icon={<Mail size={15} />} label={tr("email")} value={labFacility.email} />
              )}
            </div>
          ) : (
            <p className="text-sm text-muted">No lab facility linked to this account.</p>
          )}
        </motion.div>
      )}

      {/* Doctor Profile Card */}
      {isDoctor && (
        <motion.div variants={fadeUp} className="card border-white/70 bg-white/78 p-6 shadow-[0_20px_60px_rgba(2,132,199,0.08)] backdrop-blur-xl">
          <h2 className="mb-5 flex items-center gap-2 text-lg font-semibold">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
              <Stethoscope size={15} className="text-primary" />
            </div>
            <span className="gradient-text">{tr("myDoctorDetails")}</span>
          </h2>
          {doctorLoading ? (
            <div className="flex items-center gap-3 text-sm text-muted py-4">
              <Activity size={18} className="animate-spin text-primary" />
              {tr("loadingHealthDashboard")}
            </div>
          ) : doctorProfile ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <DashDetailRow icon={<User size={15} />} label={tr("fullName")} value={`${doctorProfile.first_name} ${doctorProfile.last_name}`} />
              {doctorProfile.specialization && (
                <DashDetailRow
                  icon={<Stethoscope size={15} />}
                  label={tr("specialization")}
                  value={<span className="badge bg-primary/12 text-primary border border-primary/20">{doctorProfile.specialization}</span>}
                />
              )}
              {doctorProfile.license_number && (
                <DashDetailRow icon={<BadgeCheck size={15} />} label={tr("license")} value={doctorProfile.license_number} />
              )}
              {doctorProfile.hospital_affiliation && (
                <DashDetailRow icon={<Building2 size={15} />} label={tr("hospital")} value={doctorProfile.hospital_affiliation} />
              )}
              {doctorProfile.cnic && (
                <DashDetailRow icon={<CreditCard size={15} />} label={tr("cnic")} value={doctorProfile.cnic} />
              )}
              {doctorProfile.phone && (
                <DashDetailRow icon={<Phone size={15} />} label={tr("phone")} value={doctorProfile.phone} />
              )}
              {doctorProfile.email && (
                <DashDetailRow icon={<Mail size={15} />} label={tr("email")} value={doctorProfile.email} />
              )}
              {doctorProfile.gender && (
                <DashDetailRow icon={<User size={15} />} label={tr("gender")} value={<span className="capitalize">{doctorProfile.gender}</span>} />
              )}
              {doctorProfile.blood_group && (
                <DashDetailRow icon={<Droplets size={15} />} label={tr("blood")} value={doctorProfile.blood_group} />
              )}
              {doctorProfile.address && (
                <DashDetailRow icon={<Building2 size={15} />} label={tr("address")} value={doctorProfile.address} />
              )}
            </div>
          ) : (
            <p className="text-sm text-muted">{tr("noDoctorData") ?? "No profile data available."}</p>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}

function ExecutiveStatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-3xl border border-white/80 bg-white/80 px-4 py-4 shadow-sm backdrop-blur-sm">
      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">{label}</div>
      <div className="mt-3 text-3xl font-black tracking-tight text-slate-950">{value}</div>
      <div className="mt-1 text-sm text-slate-600">{detail}</div>
    </div>
  );
}

function PulseMeter({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const width = Math.max(8, Math.min(100, (value / Math.max(max, 1)) * 100));
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-slate-50/85 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-medium text-slate-700">{label}</div>
        <div className="text-sm font-semibold text-slate-900">{formatCompactNumber(value)}</div>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function PowerPanel({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[30px] border border-white/80 bg-white/86 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/10">
              {icon}
            </span>
            {title}
          </div>
          <div className="mt-2 text-sm text-slate-500">{subtitle}</div>
        </div>
      </div>
      {children}
    </div>
  );
}

function MetricList({
  title,
  rows,
  tone,
  compact = false,
}: {
  title: string;
  rows: Array<{ label: string; value: number }>;
  tone: "cyan" | "violet" | "emerald" | "amber" | "pink";
  compact?: boolean;
}) {
  const toneClasses: Record<"cyan" | "violet" | "emerald" | "amber" | "pink", string> = {
    cyan: "from-cyan-400 to-sky-500",
    violet: "from-violet-400 to-fuchsia-500",
    emerald: "from-emerald-400 to-teal-500",
    amber: "from-amber-400 to-orange-500",
    pink: "from-pink-400 to-rose-500",
  };
  const maxValue = Math.max(...rows.map((row) => row.value), 1);

  return (
    <div className={`rounded-3xl border ${compact ? "border-slate-200/60 bg-slate-50/80" : "border-slate-200/70 bg-slate-50/65"} p-4`}>
      <div className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-slate-400">{title}</div>
      <div className="space-y-3">
        {rows.length > 0 ? rows.map((row) => (
          <div key={row.label}>
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <div className="truncate text-sm font-medium text-slate-700">{row.label}</div>
              <div className="text-sm font-semibold text-slate-900">{formatCompactNumber(row.value)}</div>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${toneClasses[tone]}`}
                style={{ width: `${Math.max(10, (row.value / maxValue) * 100)}%` }}
              />
            </div>
          </div>
        )) : (
          <div className="text-sm text-slate-500">No records available.</div>
        )}
      </div>
    </div>
  );
}

function Leaderboard({
  rows,
  suffix,
}: {
  rows: Array<{ id: string; label: string; value: number; subtitle: string }>;
  suffix: string;
}) {
  const maxValue = Math.max(...rows.map((row) => row.value), 1);

  return (
    <div className="space-y-3">
      {rows.length > 0 ? rows.map((row, index) => (
        <div key={row.id} className="rounded-3xl border border-slate-200/70 bg-slate-50/85 p-4">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-sm font-black text-white">
              {index + 1}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <div className="truncate text-base font-semibold text-slate-900">{row.label}</div>
                <div className="text-sm font-semibold text-slate-700">{row.value} {suffix}</div>
              </div>
              <div className="mt-1 text-sm text-slate-500">{row.subtitle}</div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500"
                  style={{ width: `${Math.max(12, (row.value / maxValue) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )) : (
        <div className="rounded-3xl border border-slate-200/70 bg-slate-50/85 p-4 text-sm text-slate-500">
          No leaderboard data available yet.
        </div>
      )}
    </div>
  );
}

function DashDetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-white/80 bg-white/85 px-4 py-3 shadow-sm">
      <span className="mt-0.5 text-primary/60 shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
        <div className="mt-0.5 text-sm font-medium text-slate-900">{value}</div>
      </div>
    </div>
  );
}
