"use client";

import { FormEvent, useState } from "react";
import { motion } from "framer-motion";
import { ScanLine, Upload } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api-client";

export default function OcrPage() {
  const [patientId, setPatientId] = useState("");
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!patientId || !fileName) {
      setError("Patient ID and file name are required.");
      return;
    }
    try {
      const data = await api.request<Record<string, unknown>>("/proposal/ocr/ingest", {
        method: "POST",
        body: JSON.stringify({ patient_id: patientId, file_name: fileName }),
      });
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "OCR placeholder failed");
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="space-y-4">
      <PageHeader
        title="OCR Intake (Proposal Placeholder)"
        subtitle="Prepared UX for PDF report ingestion while full OCR extraction backend is pending."
        icon={<ScanLine size={20} />}
      />
      <div className="card p-4">
        <form className="grid grid-cols-1 gap-3 md:grid-cols-3" onSubmit={submit}>
          <input className="input" placeholder="Patient ID (UUID)" value={patientId} onChange={(e) => setPatientId(e.target.value)} />
          <input className="input" placeholder="Report file name (e.g. cbc_report.pdf)" value={fileName} onChange={(e) => setFileName(e.target.value)} />
          <button className="btn-primary flex items-center gap-2"><Upload size={16} /> Submit OCR Intake</button>
        </form>
      </div>
      {error ? <div className="card p-4 text-sm text-danger">{error}</div> : null}
      {result ? (
        <div className="card p-4">
          <pre className="overflow-auto rounded bg-background p-3 text-xs">{JSON.stringify(result, null, 2)}</pre>
        </div>
      ) : null}
    </motion.div>
  );
}
