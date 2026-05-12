"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { AlertCircle, BarChart3, CheckCircle, Info, Loader2, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api-client";
import { getUser } from "@/lib/auth-store";
import { useLanguage } from "@/components/providers/LanguageProvider";
import { PatientSearch } from "@/components/ui/PatientSearch";
import { translateDynamicTexts } from "@/lib/dynamic-translation";

import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

type ProgressionPoint = {
  date: string;
  progression_stage: string;
  severity_score: number;
  confidence_score: number | null;
  report_type?: string | null;
  tests_used?: Array<{ name: string; value: number; unit?: string | null }>;
  medications?: Array<{ name: string, dosage: string }>;
  visit_type?: string;
  doctor_notes?: string;
};
type RiskAssessment = { status: string; message: string; ancestors_count?: number; ancestors_with_diseases_count?: number };
type Recommendations = {
  summary?: string;
  recommendations?: string[];
  next_steps?: string[];
  has_clinical_data?: boolean;
};
type DiseasePrediction = {
  disease_name?: string;
  current_stage?: string;
  predicted_stage?: string;
  confidence_score?: number | null;
  risk_level?: string;
  prediction_basis?: string;
  model_used?: string;
  months_ahead?: number;
};
type FuturePrediction = {
  overall_trajectory?: { risk_distribution?: { [key: string]: number }; status?: string; message?: string };
  predictions?: Record<string, DiseasePrediction>;
};
type LabMeasurement = { date: string; name: string; value: number; unit: string; reference_range?: string };
type LabTimeline = { [key: string]: LabMeasurement[] };

export default function ReportsPage() {
  const { tr, language } = useLanguage();
  const searchParams = useSearchParams();
  const patientIdParam = searchParams.get("patientId");
  const diseaseParam = searchParams.get("disease");
  const user = getUser();
  const initialIsPatient = user?.roles.includes("patient") ?? false;
  const initialPatientId = initialIsPatient ? (user?.patient_id || "") : "";

  const [isPatient, setIsPatient] = useState<boolean>(initialIsPatient);
  const [patientId, setPatientId] = useState<string>(patientIdParam || initialPatientId);
  const [disease, setDisease] = useState<string>(diseaseParam || "diabetes");
  const [authReady, setAuthReady] = useState(false);
  const loadRequestId = useRef(0);

  const [localViewMode, setLocalViewMode] = useState<"clinical" | "personal">("clinical");

  useEffect(() => {
    if (!user) {
      setAuthReady(true);
      return;
    }
    const isDoctor = user.roles.includes("doctor");
    if (user.roles.includes("patient")) {
      setIsPatient(true);
      setPatientId(user.patient_id || "");
    } else if (isDoctor && user.patient_id && localViewMode === "personal") {
      setIsPatient(true);
      setPatientId(user.patient_id || "");
    } else {
      setIsPatient(false);
    }
    setAuthReady(true);
  }, [localViewMode, user]);




  const [timeline, setTimeline] = useState<ProgressionPoint[]>([]);
  const [risk, setRisk] = useState<RiskAssessment | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendations | null>(null);
  const [futurePrediction, setFuturePrediction] = useState<FuturePrediction | null>(null);
  const [labTimeline, setLabTimeline] = useState<LabTimeline | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  /* Auto-load whenever patient context + language/condition changes */
  useEffect(() => {
    if (!authReady) return;
    if (patientId) {
      loadAnalytics();
    }
  }, [authReady, disease, patientId, language]);


  async function loadAnalytics(e?: FormEvent) {
    const requestId = ++loadRequestId.current;
    if (e) e.preventDefault();
    setError(null);
    if (isPatient && !patientId) return;
    if (!patientId) { setError(tr("patientIdRequired")); return; }
    setLoading(true);
    try {
      const [timelineData, riskData, recData, predictData, labData] = await Promise.all([
        api.request<ProgressionPoint[]>(`/reports/patient/${encodeURIComponent(patientId)}/progression-timeline?disease_name=${encodeURIComponent(disease)}&months_back=12`).catch(() => [] as ProgressionPoint[]),
        api.request<RiskAssessment>(`/reports/patient/${encodeURIComponent(patientId)}/risk-assessment`).catch(() => null),
        api.request<Recommendations>(`/reports/patient/${encodeURIComponent(patientId)}/recommendations`).catch(() => null),
        api.request<FuturePrediction>(`/reports/patient/${encodeURIComponent(patientId)}/predict-progression?months_ahead=6`, { method: "POST" }).catch(() => null),
        api.request<LabTimeline>(`/reports/patient/${encodeURIComponent(patientId)}/lab-measurements-timeline?disease_name=${encodeURIComponent(disease)}&months_back=12`).catch(() => null),
      ]);
      if (requestId !== loadRequestId.current) return;
      const textsToTranslate = [
        ...timelineData.map((t) => t.progression_stage),
        ...timelineData.map((t) => t.doctor_notes ?? "").filter(Boolean),
        ...(riskData?.message ? [riskData.message] : []),
        ...(recData?.summary ? [recData.summary] : []),
        ...(recData?.recommendations ?? recData?.next_steps ?? []),
        ...(predictData?.overall_trajectory?.status ? [predictData.overall_trajectory.status] : []),
        ...(predictData?.overall_trajectory?.message ? [predictData.overall_trajectory.message] : []),
      ];
      const translated = await translateDynamicTexts(textsToTranslate, language);
      const trText = (value?: string | null) => (value ? (translated[value] ?? value) : value);

      setTimeline(
        timelineData.map((item) => ({
          ...item,
          progression_stage: trText(item.progression_stage) ?? item.progression_stage,
          doctor_notes: trText(item.doctor_notes) ?? item.doctor_notes,
        }))
      );
      setRisk(riskData ? { ...riskData, message: trText(riskData.message) ?? riskData.message } : null);
      setRecommendations(
        recData
          ? {
              ...recData,
              summary: trText(recData.summary) ?? recData.summary,
              recommendations: recData.recommendations?.map((r) => trText(r) ?? r),
              next_steps: recData.next_steps?.map((r) => trText(r) ?? r),
            }
          : null
      );
      setFuturePrediction(
        predictData?.overall_trajectory
          ? {
              ...predictData,
              overall_trajectory: {
                ...predictData.overall_trajectory,
                status: trText(predictData.overall_trajectory.status) ?? predictData.overall_trajectory.status,
                message: trText(predictData.overall_trajectory.message) ?? predictData.overall_trajectory.message,
              },
            }
          : predictData
      );
      setLabTimeline(labData);
    } catch (e) {
      if (requestId !== loadRequestId.current) return;
      setError(e instanceof Error ? e.message : tr("failedToLoadReport"));
    } finally {
      if (requestId !== loadRequestId.current) return;
      setLoading(false);
    }
  }

  const recsList = recommendations?.recommendations ?? recommendations?.next_steps ?? [];
  const hasRecommendationContent = (recommendations?.has_clinical_data ?? true) && (Boolean(recommendations?.summary) || recsList.length > 0);
  const hasAnyRenderedData =
    timeline.length > 0 ||
    recsList.length > 0 ||
    !!risk ||
    !!futurePrediction ||
    !!labTimeline;

  // 1. Merge Timeline and Prediction for Integrated Graph
  // Full severity maps — keyed by lowercased stage string
  const severityByDisease: Record<string, Record<string, number>> = {
    ckd: {
      "normal": 0, "normal kidney function": 0,
      "stage 1": 1, "stage_1": 1, "early ckd stage 1": 1, "ckd stage 1": 1,
      "stage 2": 2.5, "stage_2": 2.5, "early ckd stage 2": 2.5, "ckd stage 2": 2.5,
      "stage 3a": 4, "stage_3a": 4, "moderate ckd stage 3a": 4, "ckd stage 3a": 4,
      "stage 3b": 5.5, "stage_3b": 5.5, "moderate ckd stage 3b": 5.5, "ckd stage 3b": 5.5,
      "stage 3": 5, "stage_3": 5,
      "stage 4": 7.5, "stage_4": 7.5, "advanced ckd stage 4": 7.5, "ckd stage 4": 7.5,
      "stage 5": 9, "stage_5": 9, "ckd stage 5": 9,
      "esrd": 10, "end stage renal disease": 10, "end stage renal disease (esrd)": 10, "dialysis": 10,
    },
    diabetes: {
      "normal": 0,
      "prediabetes": 3, "pre-diabetes": 3,
      "controlled": 4,
      "diabetes": 5,
      "uncontrolled": 7, "uncontrolled diabetes": 7,
      "complicated": 8.5, "complicated diabetes": 8.5,
      "severe": 9, "critical": 10,
    },
    anemia: {
      "normal": 0,
      "iron deficiency without anemia": 2,
      "mild": 2.5, "mild iron deficiency anemia": 3.5,
      "moderate": 5, "moderate iron deficiency anemia": 5.5,
      "severe": 7.5, "severe iron deficiency anemia": 8,
      "critical": 10,
    },
    parathyroid: {
      "normal parathyroid function": 0,
      "indeterminate parathyroid pattern": 3,
      "possible secondary hyperparathyroidism": 5.5, "secondary hyperparathyroidism": 5.5,
      "possible hypoparathyroidism": 6, "hypoparathyroidism": 6,
      "possible primary hyperparathyroidism": 7, "primary hyperparathyroidism": 7,
    },
    oral_cancer: {
      "normal": 0, "no oral lesion detected": 0,
      "low risk": 2,
      "suspicious oral lesion": 5, "moderate risk": 5,
      "possible oral cancer": 9, "high risk": 9,
    },
  };

  const normalizeDiseaseKey = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

  const getDiseaseAliases = (value: string) => {
    const normalized = normalizeDiseaseKey(value);
    const aliases: Record<string, string[]> = {
      diabetes: ["diabetes"],
      anemia: ["anemia"],
      ckd: ["ckd", "chronic_kidney_disease"],
      parathyroid: ["parathyroid", "parathyroid_disorder"],
      oral_cancer: ["oral_cancer", "oral_cancer_screening"],
    };
    return aliases[normalized] ?? [normalized];
  };

  const getDiseaseSeverityMap = (): Record<string, number> => {
    const normalized = normalizeDiseaseKey(disease);
    if (normalized.includes("ckd") || normalized.includes("kidney")) return severityByDisease.ckd;
    if (normalized.includes("diabet")) return severityByDisease.diabetes;
    if (normalized.includes("anemia") || normalized.includes("iron")) return severityByDisease.anemia;
    if (normalized.includes("parathyroid")) return severityByDisease.parathyroid;
    if (normalized.includes("oral") || normalized.includes("cancer")) return severityByDisease.oral_cancer;
    return severityByDisease.diabetes;
  };

  const getMappedScore = (stage: string): number => {
    const s = stage.toLowerCase().trim();
    const map = getDiseaseSeverityMap();
    if (map[s] != null) return map[s];
    // partial match within disease map
    for (const [key, val] of Object.entries(map)) {
      if (s.includes(key) || key.includes(s)) return val;
    }
    // cross-disease fallback
    for (const dm of Object.values(severityByDisease)) {
      if (dm[s] != null) return dm[s];
    }
    return 5;
  };

  const lastReal = timeline.length > 0 ? timeline[timeline.length - 1] : null;

  const getPredictedSeverityScore = (stage: string, baselineScore?: number): number => {
    const s = stage.toLowerCase().trim();
    const baseMap = getDiseaseSeverityMap();
    if (baseMap[s] != null) return baseMap[s];
    // partial match
    for (const [key, val] of Object.entries(baseMap)) {
      if (s.includes(key) || key.includes(s)) return val;
    }
    // named trajectory labels
    if (s.includes("improv")) return Math.max(0, (baselineScore ?? 4) - 1);
    if (s.includes("likely_stable") || s.includes("stable")) return baselineScore ?? 4.5;
    if (s.includes("stable_with_monitoring")) return Math.min(10, Math.max(baselineScore ?? 5, 5.5));
    if (s.includes("requires_monitoring")) return Math.min(10, Math.max(baselineScore ?? 5.5, 6));
    if (s.includes("possible_worsening")) return Math.min(10, Math.max((baselineScore ?? 5.5) + 1, 6.5));
    if (s.includes("high_risk_progression")) return Math.min(10, Math.max((baselineScore ?? 6.5) + 1.5, 8.5));
    return getMappedScore(stage);
  };

  const selectedPrediction = (() => {
    const predictions = futurePrediction?.predictions;
    if (!predictions) return null;
    const aliases = getDiseaseAliases(disease);
    for (const [key, prediction] of Object.entries(predictions)) {
      if (aliases.includes(normalizeDiseaseKey(key))) return prediction;
      if (prediction?.disease_name && aliases.includes(normalizeDiseaseKey(prediction.disease_name))) return prediction;
    }
    return null;
  })();

  const integratedData = [
    ...timeline.map(p => ({ ...p, isPredicted: false })),
    ...(selectedPrediction?.predicted_stage ? [{
      date: "Next 6M",
      // Ensure predicted point is always at least 0.5 above 0 so it's visible
      severity_score: Math.max(0.5, getPredictedSeverityScore(selectedPrediction.predicted_stage, lastReal?.severity_score)),
      progression_stage: selectedPrediction.predicted_stage,
      confidence_score: selectedPrediction.confidence_score ?? null,
      isPredicted: true
    }] : [])
  ];

  const STAGE_COLORS: Record<string, string> = {
    // CKD
    "normal": "#4CAF50", "normal kidney function": "#4CAF50",
    "stage 1": "#66BB6A", "stage_1": "#66BB6A", "early ckd stage 1": "#66BB6A", "ckd stage 1": "#66BB6A",
    "stage 2": "#8BC34A", "stage_2": "#8BC34A", "early ckd stage 2": "#8BC34A", "ckd stage 2": "#8BC34A",
    "stage 3a": "#FFC107", "stage_3a": "#FFC107", "moderate ckd stage 3a": "#FFC107", "ckd stage 3a": "#FFC107",
    "stage 3b": "#FF9800", "stage_3b": "#FF9800", "moderate ckd stage 3b": "#FF9800", "ckd stage 3b": "#FF9800",
    "stage 3": "#FFC107", "stage_3": "#FFC107",
    "stage 4": "#FF5722", "stage_4": "#FF5722", "advanced ckd stage 4": "#FF5722", "ckd stage 4": "#FF5722",
    "stage 5": "#D32F2F", "stage_5": "#D32F2F", "ckd stage 5": "#D32F2F",
    "esrd": "#9C27B0", "end stage renal disease": "#9C27B0", "end stage renal disease (esrd)": "#9C27B0", "dialysis": "#9C27B0",
    // Diabetes
    "prediabetes": "#FFF176", "pre-diabetes": "#FFF176",
    "controlled": "#66BB6A",
    "diabetes": "#FFC107",
    "uncontrolled": "#FF9800", "uncontrolled diabetes": "#FF9800",
    "complicated": "#D32F2F", "complicated diabetes": "#D32F2F",
    // Anemia
    "iron deficiency without anemia": "#AED581",
    "mild": "#8BC34A", "mild iron deficiency anemia": "#8BC34A",
    "moderate": "#FFC107", "moderate iron deficiency anemia": "#FFC107",
    "severe": "#FF5722", "severe iron deficiency anemia": "#FF5722",
    "critical": "#D32F2F",
    // Parathyroid
    "normal parathyroid function": "#4CAF50",
    "indeterminate parathyroid pattern": "#FFC107",
    "possible secondary hyperparathyroidism": "#FF9800", "secondary hyperparathyroidism": "#FF9800",
    "possible hypoparathyroidism": "#9C27B0", "hypoparathyroidism": "#9C27B0",
    "possible primary hyperparathyroidism": "#FF5722", "primary hyperparathyroidism": "#FF5722",
    // Oral Cancer
    "no oral lesion detected": "#4CAF50",
    "low risk": "#8BC34A",
    "suspicious oral lesion": "#FFC107", "moderate risk": "#FFC107",
    "possible oral cancer": "#D32F2F", "high risk": "#D32F2F",
    // Generic
    "improving": "#2196F3", "stable": "#00BCD4", "worsening": "#F44336",
  };
  const getStageColor = (stage: string) => STAGE_COLORS[(stage ?? "").toLowerCase()] || "#0284c7";
  const getSeverityColor = (score: number) => {
    if (score <= 2) return "#4CAF50";
    if (score <= 4) return "#8BC34A";
    if (score <= 6) return "#FFC107";
    if (score <= 8) return "#FF9800";
    return "#F44336";
  };
  const stagesPresent = Array.from(new Set(timeline.map(p => (p.progression_stage ?? "").replace(/_/g, " ")))).filter(Boolean);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-4 rounded-xl shadow-2xl border border-slate-100 min-w-[240px]">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
            {data.isPredicted ? tr("aiProjection") : `${tr("clinicalRecord")}: ${String(label).slice(0, 10)}`}
          </p>
          <div className="flex items-center gap-2 mb-3">
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: data.isPredicted ? "#a855f7" : getStageColor(data.progression_stage ?? "") }}
            />
            <span className="text-lg font-black text-slate-800 uppercase">{(data.progression_stage ?? "").replace(/_/g, " ")}</span>
            <span className="text-xs px-1.5 py-0.5 bg-slate-100 rounded text-slate-500 font-mono">{tr("severityShort")}: {data.severity_score}</span>
          </div>

          {!data.isPredicted && (
            <div className="mt-3 pt-3 border-t border-slate-50">
              <div className="space-y-2 text-xs text-slate-600">
                <div className="flex justify-between gap-4">
                  <span className="font-bold uppercase text-slate-400">Date</span>
                  <span className="font-semibold text-slate-700">{String(label).slice(0, 10)}</span>
                </div>
                {data.report_type && (
                  <div className="flex justify-between gap-4">
                    <span className="font-bold uppercase text-slate-400">Report Type</span>
                    <span className="font-semibold text-slate-700 text-right">{data.report_type.replace(/_/g, " ")}</span>
                  </div>
                )}
                <div className="flex justify-between gap-4">
                  <span className="font-bold uppercase text-slate-400">Stage</span>
                  <span className="font-semibold text-slate-700 text-right">{(data.progression_stage ?? "").replace(/_/g, " ")}</span>
                </div>
              </div>
            </div>
          )}

          {!data.isPredicted && data.tests_used && data.tests_used.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-50">
              <p className="text-[10px] font-bold text-primary uppercase mb-2">Tests Used</p>
              <div className="space-y-1.5">
                {data.tests_used.map((test: { name: string; value: number; unit?: string | null }, i: number) => (
                  <div key={`${test.name}-${i}`} className="flex justify-between items-center gap-3 text-xs">
                    <span className="font-semibold text-slate-700">{test.name.replace(/_/g, " ")}</span>
                    <span className="text-slate-500 font-mono text-right">
                      {test.value}{test.unit ? ` ${test.unit}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="space-y-4">
      <PageHeader
        title={isPatient ? tr("integratedHealthTrajectory") : `${tr("reports")} - ${tr("analytics")}`}
        subtitle={isPatient ? tr("integratedHealthTrajectorySubtitle") : tr("reportsAnalyticsSubtitle")}
        icon={<BarChart3 size={20} />}
      />

      {/* Input Form — hidden for patients, shown for doctors/admin */}
      <div className={`card p-4 animate-in overflow-visible relative z-30 ${isPatient ? "border-white/70 bg-white/78 shadow-[0_20px_60px_rgba(2,132,199,0.08)] backdrop-blur-xl" : ""}`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div className="flex-1">
            {!isPatient ? (
              <div className="flex flex-col md:flex-row gap-3 items-end">
                <div className="flex-1 w-full">
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-2">{tr("selectPatient")}</label>
                  <PatientSearch onSelect={(id) => setPatientId(id)} />
                </div>
                <div className="w-full md:w-48">
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-2">{tr("condition")}</label>
                  <select style={{background:'#fff',color:'#1e293b',borderColor:'#4f6ef7',appearance:'auto'}} className="input font-semibold" value={disease} onChange={(e) => setDisease(e.target.value)}>
                    <option value="diabetes">{tr("diabetes")}</option>
                    <option value="anemia">{tr("anemia")}</option>
                    <option value="ckd">{tr("ckd")}</option>
                    <option value="parathyroid">{tr("parathyroid")}</option>
                    <option value="oral_cancer">Oral Cancer</option>
                  </select>
                </div>
                {/* Analyze Trajectory button removed for doctors as requested */}
              </div>
            ) : (
              <div className="flex items-center justify-between gap-4 rounded-2xl border border-primary/10 bg-gradient-to-r from-primary/5 via-cyan-50 to-white p-4">
                <div className="flex items-center gap-4">
                  <div className="rounded-xl bg-primary/10 p-3 text-primary">
                    <CheckCircle size={24} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">{tr("viewingMyPersonalHealth")}</h3>
                    <p className="text-sm text-slate-500">{tr("viewingMyPersonalHealthSubtitle")}</p>
                  </div>
                </div>
                <select style={{background:'#fff',color:'#1e293b',borderColor:'#4f6ef7',appearance:'auto'}} className="input w-48 font-semibold" value={disease} onChange={(e) => setDisease(e.target.value)}>
                  <option value="diabetes">{tr("diabetes")}</option>
                  <option value="anemia">{tr("anemia")}</option>
                  <option value="ckd">{tr("ckd")}</option>
                  <option value="parathyroid">{tr("parathyroid")}</option>
                  <option value="oral_cancer">Oral Cancer</option>
                </select>
              </div>
            )}
          </div>

          {false && getUser()?.roles.includes("doctor") && getUser()?.patient_id && (
            <div className="flex items-center gap-1 rounded-full bg-slate-100 p-1 shrink-0">
              <button
                onClick={() => setLocalViewMode("clinical")}
                className={`px-3 py-1.5 text-xs font-bold rounded-full transition ${localViewMode === "clinical" ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                {tr("patients")}
              </button>
              <button
                onClick={() => setLocalViewMode("personal")}
                className={`px-3 py-1.5 text-xs font-bold rounded-full transition ${localViewMode === "personal" ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-emerald-500"}`}
              >
                {tr("personal")}
              </button>
            </div>
          )}
        </div>
      </div>


      {error && <div className="alert-error">{error}</div>}

      {loading && !hasAnyRenderedData && (
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={40} className="animate-spin text-primary opacity-50" />
            <span className="text-sm font-medium text-slate-400">{tr("analyzingClinicalHistory")}</span>
          </div>
        </div>
      )}

      {/* Main Trajectory Chart */}
      {!loading && (patientId || integratedData.length > 0) && (
        <div className={`card p-6 md:p-8 animate-in shadow-xl border-primary/5 bg-gradient-to-b from-white to-slate-50/30 ${isPatient ? "border-white/70 shadow-[0_24px_70px_rgba(2,132,199,0.1)]" : ""}`}>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div>
              <h3 className="text-xl font-bold text-primary border-l-4 border-primary pl-3">{tr("healthProgressionAndForecast")}</h3>
              <p className="text-sm text-slate-500 mt-1 pl-3">{tr("healthProgressionAndForecastSubtitle")}</p>
            </div>
          </div>

          {/* Current Status Mini-Cards */}
          {lastReal && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="p-4 rounded-xl border border-slate-100 bg-slate-50 flex flex-col gap-1">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Current Stage</span>
                <div className="flex items-center gap-2 mt-1">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: getStageColor(lastReal.progression_stage) }} />
                  <span className="text-base font-bold text-slate-800 capitalize">{(lastReal.progression_stage ?? "").replace(/_/g, " ")}</span>
                </div>
              </div>
              {selectedPrediction?.predicted_stage && (
                <div className="p-4 rounded-xl border border-purple-100 bg-purple-50 flex flex-col gap-1">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{tr("forecastStatus")}</span>
                  <span className={`text-base font-bold mt-1 ${
                    selectedPrediction.predicted_stage.toLowerCase().includes("improv") ? "text-success" :
                    selectedPrediction.predicted_stage.toLowerCase().includes("stable") ? "text-primary" :
                    "text-warning"
                  }`}>{selectedPrediction.predicted_stage.replace(/_/g, " ")}</span>
                </div>
              )}
              <div className="p-4 rounded-xl border border-slate-100 bg-slate-50 flex flex-col gap-1">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Severity Score</span>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-2xl font-black" style={{ color: getSeverityColor(lastReal.severity_score) }}>{lastReal.severity_score.toFixed(1)}</span>
                  <span className="text-xs text-slate-400 font-medium">/ 10</span>
                </div>
              </div>
            </div>
          )}

          {integratedData.length === 0 ? (
            <div className="py-20 text-center text-slate-400 italic">{tr("noProgressionData")}</div>
          ) : (
            <>
              <div className="h-[380px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={integratedData} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis
                      dataKey="date"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#94a3b8', fontSize: 12 }}
                      tickFormatter={(v) => v === "Next 6M" ? tr("forecast") : String(v).slice(5, 10)}
                    />
                    <YAxis
                      domain={[0, 10]}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#94a3b8', fontSize: 12 }}
                      label={{ value: tr("severity"), angle: -90, position: 'insideLeft', offset: 10, fill: '#94a3b8', fontSize: 12 }}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="severity_score"
                      stroke="#cbd5e1"
                      strokeWidth={2}
                      strokeDasharray="6 3"
                      name={tr("conditionSeverity")}
                      dot={(props: any) => {
                        const { cx, cy, payload } = props;
                        const color = payload.isPredicted ? "#a855f7" : getStageColor(payload.progression_stage ?? "");
                        const r = typeof payload.confidence_score === "number" ? 6 + payload.confidence_score * 5 : 9;
                        return <circle key={`dot-${cx}-${cy}`} cx={cx} cy={cy} r={r} fill={color} stroke="#fff" strokeWidth={2.5} />;
                      }}
                      activeDot={(props: any) => {
                        const { cx, cy, payload } = props;
                        const color = payload.isPredicted ? "#a855f7" : getStageColor(payload.progression_stage ?? "");
                        return <circle key={`adot-${cx}-${cy}`} cx={cx} cy={cy} r={13} fill={color} stroke="#fff" strokeWidth={3} opacity={0.9} />;
                      }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Stage Color Legend */}
              {stagesPresent.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-3 items-center pt-4 border-t border-slate-100">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Stage:</span>
                  {stagesPresent.map(stage => (
                    <div key={stage} className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-slate-50 border border-slate-100">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: getStageColor(stage) }} />
                      <span className="text-xs text-slate-600 capitalize font-medium">{stage}</span>
                    </div>
                  ))}
                  {integratedData.some(p => (p as any).isPredicted) && (
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-purple-50 border border-purple-100">
                      <span className="w-2.5 h-2.5 rounded-full bg-purple-400 shrink-0" />
                      <span className="text-xs text-purple-700 font-medium">{tr("forecast")}</span>
                    </div>
                  )}
                  <span className="text-xs text-slate-400 ml-auto italic">Dot size = confidence level</span>
                </div>
              )}
            </>
          )}

          {hasRecommendationContent && recommendations?.summary && (
            <div className="mt-6 rounded-2xl overflow-hidden border border-primary/20 shadow-sm">
              <div className="bg-linear-to-r from-primary to-cyan-500 px-5 py-3 flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg text-white shrink-0">
                  <TrendingUp size={18} />
                </div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-white">{tr("aiClinicalInsightSummary")}</p>
              </div>
              <div className="p-5 bg-primary/5">
                <p className="text-sm leading-relaxed text-slate-700 font-medium">
                  {recommendations.summary}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Detailed Progression History */}
      {!loading && timeline.length > 0 && (
        <div className="card p-6 md:p-8 animate-in">
          <h3 className="text-xl font-bold text-primary border-l-4 border-primary pl-3 mb-6">Detailed Progression History</h3>
          <div className="space-y-4">
            {timeline.map((entry, index) => (
              <div key={index} className="relative pl-8 pb-4 last:pb-0">
                {index < timeline.length - 1 && (
                  <div className="absolute left-[15px] top-6 bottom-0 w-0.5 bg-slate-200" />
                )}
                <div
                  className="absolute left-0 top-1 w-4 h-4 rounded-full border-2 border-white shadow"
                  style={{ backgroundColor: getStageColor(entry.progression_stage) }}
                />
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <span
                        className="px-3 py-1 rounded-full text-xs font-bold text-white capitalize"
                        style={{ backgroundColor: getStageColor(entry.progression_stage) }}
                      >
                        {(entry.progression_stage ?? "").replace(/_/g, " ")}
                      </span>
                      <span className="text-xs text-slate-400">
                        {new Date(entry.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                      </span>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-center">
                        <div className="text-xs text-slate-500">Severity</div>
                        <div className="text-base font-bold" style={{ color: getSeverityColor(entry.severity_score) }}>{entry.severity_score.toFixed(1)}</div>
                      </div>
                      {typeof entry.confidence_score === "number" && (
                        <div className="text-center">
                          <div className="text-xs text-slate-500">Confidence</div>
                          <div className="text-base font-bold text-primary">{(entry.confidence_score * 100).toFixed(0)}%</div>
                        </div>
                      )}
                    </div>
                  </div>
                  {entry.doctor_notes && (
                    <div className="mt-2 p-3 bg-primary/5 border border-primary/10 rounded-lg">
                      <p className="text-xs font-bold text-primary mb-1">Doctor&apos;s Notes:</p>
                      <p className="text-xs text-slate-700">{entry.doctor_notes}</p>
                    </div>
                  )}
                  {entry.medications && entry.medications.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {entry.medications.map((m: { name: string; dosage: string }, i: number) => (
                        <span key={i} className="text-xs px-2 py-1 bg-white border border-slate-200 rounded-full text-slate-600">
                          {m.name} {m.dosage}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Next Steps Section (The LLM Summary Part) */}
      {!loading && hasRecommendationContent && (
        <div className="card animate-in overflow-hidden">
          <div className="bg-linear-to-r from-primary to-cyan-500 px-6 py-4 flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg text-white shrink-0">
              <CheckCircle size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">{tr("yourPersonalizedActionPlan")}</h3>
              <p className="text-xs text-white/70">{tr("yourPersonalizedActionPlanSubtitle")}</p>
            </div>
          </div>
          <div className="p-6 md:p-8">
            {recsList.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {recsList.map((step, idx) => (
                  <div key={`${idx}-${step}`} className="flex gap-3 p-4 rounded-xl bg-primary/5 border border-primary/10 hover:border-primary/30 hover:bg-primary/10 transition group">
                    <span className="mt-0.5 w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold shrink-0">{idx + 1}</span>
                    <p className="text-sm font-medium text-slate-700 leading-relaxed">{step}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10 bg-primary/5 rounded-xl border border-dashed border-primary/20">
                <p className="text-sm text-slate-400 italic">{tr("recommendationsWillAppear")}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {!loading && !patientId && !isPatient && (
        <div className="card p-12 text-center text-slate-400">
          <BarChart3 size={48} className="mx-auto mb-4 opacity-10" />
          <p className="text-lg font-medium">{tr("readyToAnalyzeTrajectory")}</p>
          <p className="text-sm">{tr("enterPatientIdToAnalyze")}</p>
        </div>
      )}
    </motion.div>
  );
}
