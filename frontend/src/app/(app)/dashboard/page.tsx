"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Activity, FlaskConical, Dna, Lightbulb, Stethoscope,
  GitBranch, ArrowRight, TrendingUp, AlertTriangle, CheckCircle,
  BadgeCheck, Phone, Mail, CreditCard, Building2, User, Droplets, MapPin,
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

  useEffect(() => {
    if (isPatient && patientId) {
      loadPatientDashboard(patientId);
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
  }, [isPatient, patientId, isDoctor, isLab, language]);

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
