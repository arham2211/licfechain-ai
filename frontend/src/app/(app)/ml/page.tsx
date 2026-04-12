"use client";

import { FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Brain, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api-client";
import { getUser } from "@/lib/auth-store";

type MLResult = {
  diagnosis?: string;
  confidence?: number;
  disease?: string;
  prediction_type?: string;
  probabilities?: Record<string, number>;
  [key: string]: unknown;
};

export default function MlPage() {
  const searchParams = useSearchParams();
  const presetPatientId = searchParams.get("patient_id") ?? "";
  const user = getUser();
  const userRoles = user?.roles ?? [];
  const isPatient = userRoles[0] === "patient";
  const canPredict = userRoles.some((r) => ["admin", "doctor", "patient"].includes(r));

  const [diseases, setDiseases] = useState<string[]>([]);
  const [disease, setDisease] = useState("parathyroid");
  const [mode, setMode] = useState<"sample" | "patient" | "custom">(isPatient ? "patient" : "sample");
  const [patientId, setPatientId] = useState(isPatient ? (user?.patient_id ?? presetPatientId) : presetPatientId);
  const [result, setResult] = useState<MLResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // custom features
  const [customFeatures, setCustomFeatures] = useState<Record<string, string>>({});

  const diseaseFeatures: Record<string, string[]> = {
    parathyroid: ["pth", "calcium", "phosphorus", "vitamin_d", "creatinine", "egfr", "alkaline_phosphatase", "albumin"],
    ckd: ["serum_creatinine", "egfr", "uacr", "bun", "sodium", "potassium", "calcium", "phosphorus", "hemoglobin", "pth", "bicarbonate", "albumin", "bmi", "systolic_bp", "diastolic_bp"],
    diabetes: ["fasting_glucose", "hba1c", "hdl", "ldl", "triglycerides", "total_cholesterol", "creatinine", "bmi", "systolic_bp", "diastolic_bp"],
    anemia: ["hemoglobin", "hematocrit", "mcv", "mch", "mchc", "rdw", "serum_iron", "ferritin", "tibc", "transferrin_saturation", "reticulocyte_count"],
    iron_deficiency_anemia: ["hemoglobin", "hematocrit", "mcv", "mch", "mchc", "rdw", "serum_iron", "ferritin", "tibc", "transferrin_saturation", "reticulocyte_count"],
  };

  useEffect(() => {
    async function load() {
      try {
        const data = await api.request<{ supported_diseases: string[] }>("/ml/diseases");
        setDiseases(data.supported_diseases);
        if (data.supported_diseases.length > 0) setDisease(data.supported_diseases[0]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load diseases");
      }
    }
    load();
  }, []);

  useEffect(() => {
    // Reset custom features when disease changes
    const features = diseaseFeatures[disease] ?? diseaseFeatures["diabetes"];
    const init: Record<string, string> = {};
    features.forEach((f) => { init[f] = ""; });
    setCustomFeatures(init);
  }, [disease]);

  async function runPrediction(e: FormEvent) {
    e.preventDefault();
    setError(null); setResult(null); setLoading(true);
    try {
      if (mode === "patient") {
        if (!patientId) { setError("Patient ID required"); setLoading(false); return; }
        const res = await api.request<MLResult>(`/ml/patient/${encodeURIComponent(patientId)}/diagnosis?disease_name=${encodeURIComponent(disease)}&auto_save=true`);
        setResult(res);
      } else if (mode === "custom") {
        const features: Record<string, number> = {};
        for (const [k, v] of Object.entries(customFeatures)) {
          if (v) features[k] = parseFloat(v);
        }
        if (Object.keys(features).length === 0) { setError("Enter at least one feature value"); setLoading(false); return; }
        const res = await api.request<MLResult>("/ml/diagnosis/predict", {
          method: "POST",
          body: JSON.stringify({ disease_name: disease, features }),
        });
        setResult(res);
      } else {
        // sample mode with hardcoded values
        const samplePayloads: Record<string, Record<string, number>> = {
          parathyroid: { pth: 95, calcium: 10.8, phosphorus: 3.1, vitamin_d: 22, creatinine: 1.2, egfr: 72, alkaline_phosphatase: 138, albumin: 4.1 },
          ckd: { serum_creatinine: 1.8, egfr: 48, uacr: 120, bun: 32, sodium: 139, potassium: 4.6, calcium: 9.3, phosphorus: 4.7, hemoglobin: 11.8, pth: 82, bicarbonate: 22, albumin: 3.9, bmi: 27, systolic_bp: 136, diastolic_bp: 86 },
          diabetes: { fasting_glucose: 135, hba1c: 7.2, hdl: 45, ldl: 132, triglycerides: 162, total_cholesterol: 212, creatinine: 1.0, bmi: 29, systolic_bp: 134, diastolic_bp: 84 },
        };
        const features = samplePayloads[disease] ?? samplePayloads["diabetes"];
        const res = await api.request<MLResult>("/ml/diagnosis/predict", {
          method: "POST",
          body: JSON.stringify({ disease_name: disease, features }),
        });
        setResult(res);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "ML request failed");
    } finally {
      setLoading(false);
    }
  }

  const features = diseaseFeatures[disease] ?? [];

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="space-y-4">
      <PageHeader title="ML Diagnosis & Progression" subtitle="Unified disease models with explainable probabilities." icon={<Brain size={20} />} />

      {/* Mode Selection + Disease */}
      <div className="card p-4">
        <form className="space-y-4" onSubmit={runPrediction}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Disease</label>
              <select className="input" value={disease} onChange={(e) => setDisease(e.target.value)}>
                {diseases.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Prediction Mode</label>
              <select className="input" value={mode} onChange={(e) => setMode(e.target.value as "sample" | "patient" | "custom")}>
                <option value="sample">Sample Data</option>
                {canPredict && <option value="patient">Patient (Auto-fetch labs)</option>}
                {canPredict && <option value="custom">Custom Features</option>}
              </select>
            </div>
            {mode === "patient" && (
              <div>
                <label className="mb-1 block text-sm font-medium">Patient ID</label>
                <input className="input" value={patientId} onChange={(e) => setPatientId(e.target.value)} placeholder="Enter Patient UUID" required />
              </div>
            )}
          </div>

          {/* Custom Features Grid */}
          {mode === "custom" && features.length > 0 && (
            <div>
              <label className="mb-2 block text-sm font-medium">Enter Lab Values</label>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {features.map((f) => (
                  <div key={f}>
                    <label className="mb-0.5 block text-xs text-muted">{f.replace(/_/g, " ")}</label>
                    <input
                      className="input text-sm"
                      type="number"
                      step="0.01"
                      value={customFeatures[f] ?? ""}
                      onChange={(e) => setCustomFeatures({ ...customFeatures, [f]: e.target.value })}
                      placeholder="0.0"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <button className="btn-primary flex items-center gap-2" type="submit" disabled={loading}>
            {loading ? <><Loader2 size={16} className="animate-spin" /> Predicting...</> : "Run Diagnosis"}
          </button>
        </form>
      </div>

      {error ? <div className="card p-4 text-sm text-danger">{error}</div> : null}

      {result && (
        <div className="card p-4">
          <h3 className="mb-2 font-semibold">Prediction Result</h3>
          {/* Structured result display */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-4">
            {result.diagnosis != null && (
              <div className="rounded-md border border-border p-3">
                <div className="text-xs text-muted">Diagnosis</div>
                <div className="mt-1 text-lg font-semibold">{result.diagnosis}</div>
              </div>
            )}
            {result.confidence != null && (
              <div className="rounded-md border border-border p-3">
                <div className="text-xs text-muted">Confidence</div>
                <div className="mt-1 text-lg font-semibold">{(result.confidence * 100).toFixed(1)}%</div>
              </div>
            )}
            {result.disease != null && (
              <div className="rounded-md border border-border p-3">
                <div className="text-xs text-muted">Disease Model</div>
                <div className="mt-1 text-lg font-semibold capitalize">{result.disease}</div>
              </div>
            )}
            {result.prediction_type != null && (
              <div className="rounded-md border border-border p-3">
                <div className="text-xs text-muted">Type</div>
                <div className="mt-1 text-lg font-semibold capitalize">{result.prediction_type}</div>
              </div>
            )}
          </div>
          {/* Probabilities */}
          {result.probabilities && (
            <div className="mb-4">
              <h4 className="text-sm font-medium mb-2">Class Probabilities</h4>
              <div className="space-y-2">
                {Object.entries(result.probabilities).map(([cls, prob]) => (
                  <div key={cls} className="flex items-center gap-3">
                    <span className="w-32 text-sm text-muted">{cls}</span>
                    <div className="flex-1 h-4 rounded-full bg-background overflow-hidden">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(prob * 100).toFixed(0)}%` }} />
                    </div>
                    <span className="text-sm font-medium w-16 text-right">{(prob * 100).toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Raw JSON */}
          <details>
            <summary className="cursor-pointer text-xs text-muted">Raw JSON Response</summary>
            <pre className="mt-2 overflow-auto rounded bg-background p-3 text-xs">{JSON.stringify(result, null, 2)}</pre>
          </details>
        </div>
      )}
    </motion.div>
  );
}
