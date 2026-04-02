"use client";

import { FormEvent, useState } from "react";
import { motion } from "framer-motion";
import { Smile, ScanLine, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api-client";

export default function DentalPage() {
  const [patientId, setPatientId] = useState("");
  const [imageName, setImageName] = useState("");
  const [diagnosis, setDiagnosis] = useState<Record<string, unknown> | null>(null);
  const [progression, setProgression] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runDiagnosis(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setDiagnosis(null);
    try {
      const data = await api.request<Record<string, unknown>>("/proposal/dental/analyze", {
        method: "POST",
        body: JSON.stringify({ patient_id: patientId, image_name: imageName }),
      });
      setDiagnosis(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Dental analyze failed");
    }
  }

  async function runProgression() {
    setError(null);
    setProgression(null);
    try {
      const data = await api.request<Record<string, unknown>>(
        `/proposal/dental/progression/${encodeURIComponent(patientId)}`,
        {
        method: "GET",
        }
      );
      setProgression(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Dental progression failed");
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="space-y-4">
      <PageHeader
        title="Dental AI (Proposal Placeholder)"
        subtitle="Professional frontend workflow for lesion diagnosis and progression tracking."
        icon={<Smile size={20} />}
      />
      <div className="card p-4">
        <form className="grid grid-cols-1 gap-3 md:grid-cols-3" onSubmit={runDiagnosis}>
          <input className="input" placeholder="Patient ID (UUID)" value={patientId} onChange={(e) => setPatientId(e.target.value)} />
          <input className="input" placeholder="Image name (e.g. oral_visit1.jpg)" value={imageName} onChange={(e) => setImageName(e.target.value)} />
          <button className="btn-primary flex items-center gap-2"><ScanLine size={16} /> Analyze Dental Image</button>
        </form>
        <button className="btn-primary mt-3 flex items-center gap-2" onClick={runProgression}>
          <TrendingUp size={16} /> Check Progression for Patient
        </button>
      </div>
      {error ? <div className="card p-4 text-sm text-danger">{error}</div> : null}
      {diagnosis ? (
        <div className="card p-4">
          <h3 className="font-semibold">Diagnosis Output</h3>
          <pre className="overflow-auto rounded bg-background p-3 text-xs">{JSON.stringify(diagnosis, null, 2)}</pre>
        </div>
      ) : null}
      {progression ? (
        <div className="card p-4">
          <h3 className="font-semibold">Progression Output</h3>
          <pre className="overflow-auto rounded bg-background p-3 text-xs">{JSON.stringify(progression, null, 2)}</pre>
        </div>
      ) : null}
    </motion.div>
  );
}
