"use client";

import { FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { BarChart3, CheckCircle, Loader2, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api-client";
import { getUser } from "@/lib/auth-store";
import { useLanguage } from "@/components/providers/LanguageProvider";
import { PatientSearch } from "@/components/ui/PatientSearch";

import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

type ProgressionPoint = {
  date: string;
  progression_stage: string;
  severity_score: number;
  confidence_score: number | null;
  medications?: Array<{ name: string, dosage: string }>;
  visit_type?: string;
  doctor_notes?: string;
};
type RiskAssessment = { status: string; message: string; ancestors_count?: number; ancestors_with_diseases_count?: number };
type Recommendations = { summary?: string; recommendations?: string[]; next_steps?: string[] };
type FuturePrediction = { overall_trajectory?: { risk_distribution?: { [key: string]: number }; status?: string; message?: string } };
type LabMeasurement = { date: string; name: string; value: number; unit: string; reference_range?: string };
type LabTimeline = { [key: string]: LabMeasurement[] };

export default function ReportsPage() {
  const { tr } = useLanguage();
  const searchParams = useSearchParams();
  const patientIdParam = searchParams.get("patientId");
  const diseaseParam = searchParams.get("disease");

  const [isPatient, setIsPatient] = useState<boolean>(false);
  const [patientId, setPatientId] = useState<string>(patientIdParam || "");
  const [disease, setDisease] = useState<string>(diseaseParam || "diabetes");

  const [localViewMode, setLocalViewMode] = useState<"clinical" | "personal">("clinical");

  useEffect(() => {
    const user = getUser();
    if (!user) return;
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
  }, [localViewMode]);




  const [timeline, setTimeline] = useState<ProgressionPoint[]>([]);
  const [risk, setRisk] = useState<RiskAssessment | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendations | null>(null);
  const [futurePrediction, setFuturePrediction] = useState<FuturePrediction | null>(null);
  const [labTimeline, setLabTimeline] = useState<LabTimeline | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  /* Auto-load for patient role */
  useEffect(() => {
    if (isPatient && patientId) {
      loadAnalytics();
    }
  }, [disease, isPatient, patientId]);


  async function loadAnalytics(e?: FormEvent) {
    if (e) e.preventDefault();
    setError(null); setTimeline([]); setRisk(null); setRecommendations(null); setFuturePrediction(null); setLabTimeline(null);
    if (!patientId) { setError(tr("patientIdRequired")); return; }
    setLoading(true);
    try {
      const [timelineData, riskData, recData, predictData, labData] = await Promise.all([
        api.request<ProgressionPoint[]>(`/reports/patient/${encodeURIComponent(patientId)}/progression-timeline?disease_name=${encodeURIComponent(disease)}&months_back=12`),
        api.request<RiskAssessment>(`/reports/patient/${encodeURIComponent(patientId)}/risk-assessment`),
        api.request<Recommendations>(`/reports/patient/${encodeURIComponent(patientId)}/recommendations`),
        api.request<FuturePrediction>(`/reports/patient/${encodeURIComponent(patientId)}/predict-progression?months_ahead=6`, { method: "POST" }),
        api.request<LabTimeline>(`/reports/patient/${encodeURIComponent(patientId)}/lab-measurements-timeline?months_back=12`),
      ]);
      setTimeline(timelineData); setRisk(riskData); setRecommendations(recData); setFuturePrediction(predictData); setLabTimeline(labData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load report");
    } finally {
      setLoading(false);
    }
  }

  const recsList = recommendations?.recommendations ?? recommendations?.next_steps ?? [];

  // 1. Merge Timeline and Prediction for Integrated Graph
  const severityMapping: Record<string, number> = {
    "normal": 0, "stage 1": 1, "stage_1": 1, "stage 2": 2.5, "stage_2": 2.5,
    "stage 3": 5, "stage_3": 5, "stage 4": 7.5, "stage_4": 7.5, "stage 5": 10, "stage_5": 10
  };

  const getMappedScore = (stage: string) => {
    const s = stage.toLowerCase();
    if (s.includes("diabetes")) return 5;
    if (s.includes("uncontrolled")) return 7.5;
    if (s.includes("complicated")) return 9;
    return severityMapping[s] ?? 5;
  };

  const integratedData = [
    ...timeline.map(p => ({ ...p, isPredicted: false })),
    ...(futurePrediction?.overall_trajectory ? [{
      date: "Next 6M",
      severity_score: getMappedScore(futurePrediction.overall_trajectory.status || "Normal"),
      progression_stage: futurePrediction.overall_trajectory.status,
      isPredicted: true
    }] : [])
  ];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-4 rounded-xl shadow-2xl border border-slate-100 min-w-[200px]">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
            {data.isPredicted ? "AI Projection" : `Clinical Record: ${String(label).slice(0, 10)}`}
          </p>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg font-black text-slate-800 uppercase">{data.progression_stage?.replace(/_/g, " ")}</span>
            <span className="text-xs px-1.5 py-0.5 bg-slate-100 rounded text-slate-500 font-mono">Sev: {data.severity_score}</span>
          </div>

          {!data.isPredicted && data.medications && data.medications.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-50">
              <p className="text-[10px] font-bold text-primary uppercase mb-2">Medications at this stage:</p>
              <div className="space-y-1.5">
                {data.medications.map((m: any, i: number) => (
                  <div key={i} className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-slate-700">{m.name}</span>
                    <span className="text-slate-400 font-mono">{m.dosage}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!data.isPredicted && data.doctor_notes && (
            <div className="mt-3 pt-3 border-t border-slate-50">
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Doctor Notes:</p>
              <p className="text-[11px] text-slate-500 italic line-clamp-2">{data.doctor_notes}</p>
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
        title={isPatient ? "Integrated Health Trajectory" : `${tr("reports")} - ${tr("analytics")}`}
        subtitle={isPatient ? "AI-powered view of your historical progression, medications, and future medical forecast." : "Progression graphs, risk analysis, and next-step recommendations."}
        icon={<BarChart3 size={20} />}
      />

      {/* Input Form — hidden for patients, shown for doctors/admin */}
      <div className="card p-4 animate-in overflow-visible relative z-30">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div className="flex-1">
            {!isPatient ? (
              <div className="flex flex-col md:flex-row gap-3 items-end">
                <div className="flex-1 w-full">
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Select Patient</label>
                  <PatientSearch onSelect={(id) => setPatientId(id)} />
                </div>
                <div className="w-full md:w-48">
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Condition</label>
                  <select className="input" value={disease} onChange={(e) => setDisease(e.target.value)}>
                    <option value="diabetes">Diabetes</option>
                    <option value="anemia">Anemia</option>
                    <option value="ckd">CKD</option>
                    <option value="parathyroid">Parathyroid</option>
                  </select>
                </div>
                <button
                  onClick={loadAnalytics}
                  className="btn-primary flex items-center justify-center gap-2 h-[42px] px-6"
                  disabled={loading || !patientId}
                >
                  {loading ? <><Loader2 size={16} className="animate-spin" /> Loading...</> : "Analyze Trajectory"}
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-600">
                    <CheckCircle size={24} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">Viewing My Personal Health</h3>
                    <p className="text-sm text-slate-500">Displaying your own verified clinical data and AI forecasts.</p>
                  </div>
                </div>
                <select className="input w-48" value={disease} onChange={(e) => setDisease(e.target.value)}>
                  <option value="diabetes">Diabetes</option>
                  <option value="anemia">Anemia</option>
                  <option value="ckd">CKD</option>
                  <option value="parathyroid">Parathyroid</option>
                </select>
              </div>
            )}
          </div>

          {getUser()?.roles.includes("doctor") && getUser()?.patient_id && (
            <div className="flex items-center gap-1 rounded-full bg-slate-100 p-1 shrink-0">
              <button
                onClick={() => setLocalViewMode("clinical")}
                className={`px-3 py-1.5 text-xs font-bold rounded-full transition ${localViewMode === "clinical" ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                Patients
              </button>
              <button
                onClick={() => setLocalViewMode("personal")}
                className={`px-3 py-1.5 text-xs font-bold rounded-full transition ${localViewMode === "personal" ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-emerald-500"}`}
              >
                Personal
              </button>
            </div>
          )}
        </div>
      </div>


      {error && <div className="alert-error">{error}</div>}

      {loading && (
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={40} className="animate-spin text-primary opacity-50" />
            <span className="text-sm font-medium text-slate-400">Analyzing clinical history & medications...</span>
          </div>
        </div>
      )}

      {/* Main Trajectory Chart */}
      {!loading && (patientId || integratedData.length > 0) && (
        <div className="card p-6 md:p-8 animate-in shadow-xl border-primary/5 bg-gradient-to-b from-white to-slate-50/30">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div>
              <h3 className="text-xl font-bold text-slate-800">Health Progression, Medications & AI Forecast</h3>
              <p className="text-sm text-slate-500">View how your treatments correlate with your disease progression over time.</p>
            </div>
            {futurePrediction?.overall_trajectory?.status && (
              <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-full border border-slate-100 shadow-sm">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Forecast Status:</span>
                <span className={`text-sm font-bold ${futurePrediction.overall_trajectory.status.toLowerCase().includes("improv") ? "text-success" :
                  futurePrediction.overall_trajectory.status.toLowerCase().includes("stable") ? "text-primary" :
                    "text-warning"
                  }`}>
                  {futurePrediction.overall_trajectory.status}
                </span>
              </div>
            )}
          </div>

          {integratedData.length === 0 ? (
            <div className="py-20 text-center text-slate-400 italic">No progression data available yet. Please complete more lab tests.</div>
          ) : (
            <div className="h-[400px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={integratedData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="lineGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#94a3b8', fontSize: 12 }}
                    tickFormatter={(v) => v === "Next 6M" ? "Forecast" : String(v).slice(5, 10)}
                  />
                  <YAxis
                    domain={[0, 10]}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#94a3b8', fontSize: 12 }}
                    label={{ value: 'Severity', angle: -90, position: 'insideLeft', offset: 10, fill: '#94a3b8', fontSize: 12 }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend verticalAlign="top" height={36} />
                  <Line
                    type="monotone"
                    dataKey="severity_score"
                    stroke="var(--primary)"
                    strokeWidth={4}
                    name="Condition Severity"
                    dot={{ r: 6, fill: 'white', strokeWidth: 2 }}
                    activeDot={{ r: 8, strokeWidth: 0 }}
                  />
                  {/* Future Forecast Segment is naturally the last point in the integrated data */}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {futurePrediction?.overall_trajectory?.message && (
            <div className="mt-8 p-6 rounded-2xl bg-slate-900 text-white shadow-2xl overflow-hidden relative border border-white/5">
              <div className="absolute right-0 bottom-0 w-64 h-64 bg-primary/20 blur-[100px] rounded-full translate-x-1/2 translate-y-1/2"></div>
              <div className="flex items-start gap-4">
                <div className="p-3 bg-primary/10 rounded-xl text-primary border border-primary/20 backdrop-blur">
                  <TrendingUp size={24} />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary/80 mb-2">AI Clinical Insight Summary</p>
                  <div className="prose prose-invert prose-sm">
                    <p className="text-base leading-relaxed text-slate-100 font-medium">
                      {recommendations?.summary || futurePrediction.overall_trajectory.message}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* AI Next Steps Section (The LLM Summary Part) */}
      {!loading && (patientId || recsList.length > 0) && (
        <div className="card p-6 md:p-8 animate-in border-l-8 border-primary">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-primary/10 rounded-xl text-primary">
              <CheckCircle size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-800">Your Personalized Action Plan</h3>
              <p className="text-sm text-slate-500">Evidence-based recommendations based on your unique profile.</p>
            </div>
          </div>

          {recsList.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {recsList.map((step, idx) => (
                <div key={`${idx}-${step}`} className="flex gap-4 p-5 rounded-2xl bg-slate-50 border border-slate-100 hover:border-primary/20 transition group">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-700 leading-relaxed">{step}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              <p className="text-sm text-slate-400 italic">Recommendations will appear here once enough medical data is available for analysis.</p>
            </div>
          )}
        </div>
      )}

      {!loading && !patientId && !isPatient && (
        <div className="card p-12 text-center text-slate-400">
          <BarChart3 size={48} className="mx-auto mb-4 opacity-10" />
          <p className="text-lg font-medium">Ready to analyze patient trajectory?</p>
          <p className="text-sm">Enter a Patient ID and select a disease above to generate a high-impact health report.</p>
        </div>
      )}
    </motion.div>
  );
}
