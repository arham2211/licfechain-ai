"use client";

import { FormEvent, useState } from "react";
import { motion } from "framer-motion";
import { Globe, Languages } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api-client";

export default function TranslationPage() {
  const [patientId, setPatientId] = useState("");
  const [lang, setLang] = useState("ur");
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function preview(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPayload(null);
    if (!patientId) {
      setError("Patient ID is required");
      return;
    }
    try {
      const data = await api.request<Record<string, unknown>>(
        `/patients/${encodeURIComponent(patientId)}/family-disease-history?lang=${lang}`
      );
      setPayload(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load translated response");
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="space-y-4">
      <PageHeader title="Translation Layer" subtitle="Multilingual access to clinical response payloads." icon={<Globe size={20} />} />
      <div className="card p-4">
        <form className="grid grid-cols-1 gap-3 md:grid-cols-3" onSubmit={preview}>
          <input className="input" placeholder="Patient ID (UUID)" value={patientId} onChange={(e) => setPatientId(e.target.value)} />
          <select className="input" value={lang} onChange={(e) => setLang(e.target.value)}>
            <option value="en">English (en)</option>
            <option value="ur">Urdu (ur)</option>
            <option value="fr">French (fr)</option>
            <option value="de">German (de)</option>
          </select>
          <button className="btn-primary flex items-center gap-2"><Languages size={16} /> Preview Translation</button>
        </form>
      </div>
      {error ? <div className="card p-4 text-sm text-danger">{error}</div> : null}
      {payload ? (
        <div className="card p-4">
          <pre className="overflow-auto rounded bg-background p-3 text-xs">{JSON.stringify(payload, null, 2)}</pre>
        </div>
      ) : null}
    </motion.div>
  );
}
