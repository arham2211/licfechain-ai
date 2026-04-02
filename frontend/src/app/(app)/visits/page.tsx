"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { CalendarDays, Plus, X } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api-client";
import { getUser } from "@/lib/auth-store";

type Visit = {
  visit_id: string;
  patient_id: string;
  doctor_patient_id: string;
  visit_type: string;
  visit_date: string;
  chief_complaint?: string;
  doctor_notes?: string;
};

type PatientOption = {
  patient_id: string;
  first_name: string;
  last_name: string;
  cnic: string;
};

type DoctorOption = {
  patient_id: string;
  first_name: string;
  last_name: string;
  specialization?: string;
};

const VISIT_TYPES = ["consultation", "follow_up", "routine_checkup", "lab_review", "emergency"];

export default function VisitsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const presetPatientId = searchParams.get("patient_id") ?? "";

  const user = getUser();
  const userRoles = user?.roles ?? [];
  const canCreate = userRoles.some((r) => ["admin", "doctor"].includes(r));

  const [rows, setRows] = useState<Visit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // Create form
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [form, setForm] = useState({
    patient_id: presetPatientId,
    doctor_patient_id: "",
    visit_type: "consultation",
    visit_date: new Date().toISOString().slice(0, 16),
    chief_complaint: "",
    doctor_notes: "",
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    loadVisits();
  }, []);

  async function loadVisits() {
    try {
      let url = "/visits?skip=0&limit=100";
      if (presetPatientId) url += `&patient_id=${presetPatientId}`;
      const data = await api.request<Visit[]>(url);
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load visits");
    }
  }

  async function openCreate() {
    setShowCreate(true);
    try {
      const [p, d] = await Promise.all([
        api.request<PatientOption[]>("/patients?skip=0&limit=500"),
        api.request<DoctorOption[]>("/doctors?skip=0&limit=100"),
      ]);
      setPatients(p);
      setDoctors(d);
    } catch {
      // silently fail
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      const payload = {
        ...form,
        visit_date: new Date(form.visit_date).toISOString(),
        vital_signs: null,
        chief_complaint: form.chief_complaint || null,
        doctor_notes: form.doctor_notes || null,
      };
      await api.request("/visits/", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setShowCreate(false);
      setForm({
        patient_id: presetPatientId,
        doctor_patient_id: "",
        visit_type: "consultation",
        visit_date: new Date().toISOString().slice(0, 16),
        chief_complaint: "",
        doctor_notes: "",
      });
      setSuccessMsg("Visit created successfully");
      setTimeout(() => setSuccessMsg(null), 3000);
      await loadVisits();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Failed to create visit");
    } finally {
      setCreating(false);
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="space-y-4">
      <PageHeader
        title="Visits"
        subtitle="Consultations, follow-ups, and lab review encounters."
        icon={<CalendarDays size={20} />}
        right={
          canCreate ? (
            <button className="btn-primary" onClick={openCreate}>
              <Plus size={16} /> New Visit
            </button>
          ) : undefined
        }
      />

      {error ? <div className="card p-4 text-sm text-danger">{error}</div> : null}
      {successMsg && <div className="alert-success">{successMsg}</div>}

      {/* Create Visit Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="card w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Create New Visit</h2>
              <button className="rounded-md border border-border px-3 py-1 text-sm" onClick={() => setShowCreate(false)}><X size={16} /></button>
            </div>
            <form className="mt-4 space-y-4" onSubmit={handleCreate}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium">Patient *</label>
                  <select className="input" value={form.patient_id} onChange={(e) => setForm({ ...form, patient_id: e.target.value })} required>
                    <option value="">-- Select patient --</option>
                    {patients.map((p) => (
                      <option key={p.patient_id} value={p.patient_id}>{p.first_name} {p.last_name} ({p.cnic})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Doctor *</label>
                  <select className="input" value={form.doctor_patient_id} onChange={(e) => setForm({ ...form, doctor_patient_id: e.target.value })} required>
                    <option value="">-- Select doctor --</option>
                    {doctors.map((d) => (
                      <option key={d.patient_id} value={d.patient_id}>Dr. {d.first_name} {d.last_name}{d.specialization ? ` (${d.specialization})` : ""}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium">Visit Type *</label>
                  <select className="input" value={form.visit_type} onChange={(e) => setForm({ ...form, visit_type: e.target.value })}>
                    {VISIT_TYPES.map((t) => (
                      <option key={t} value={t}>{t.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Visit Date/Time *</label>
                  <input className="input" type="datetime-local" value={form.visit_date} onChange={(e) => setForm({ ...form, visit_date: e.target.value })} required />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Chief Complaint</label>
                <textarea className="input min-h-[80px]" value={form.chief_complaint} onChange={(e) => setForm({ ...form, chief_complaint: e.target.value })} placeholder="Describe the main reason for this visit..." />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Doctor Notes</label>
                <textarea className="input min-h-[80px]" value={form.doctor_notes} onChange={(e) => setForm({ ...form, doctor_notes: e.target.value })} placeholder="Additional clinical notes..." />
              </div>
              {createError ? <p className="text-sm text-danger">{createError}</p> : null}
              <div className="flex justify-end gap-2">
                <button type="button" className="rounded-md border border-border px-4 py-2 text-sm" onClick={() => setShowCreate(false)}>Cancel</button>
                <button className="btn-primary" type="submit" disabled={creating}>{creating ? "Creating..." : "Create Visit"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Visits Table */}
      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="table-header">
            <tr>
              <th className="px-4 py-3 text-left">Date</th>
              <th className="px-4 py-3 text-left">Type</th>
              <th className="px-4 py-3 text-left">Chief Complaint</th>
              <th className="px-4 py-3 text-left">Patient ID</th>
              <th className="px-4 py-3 text-left">Doctor ID</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.visit_id}
                className="table-row cursor-pointer hover:bg-background/50 transition"
                onClick={() => router.push(`/visits/${r.visit_id}`)}
              >
                <td className="px-4 py-3">{String(r.visit_date).slice(0, 16).replace("T", " ")}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                    {r.visit_type.replace(/_/g, " ")}
                  </span>
                </td>
                <td className="px-4 py-3">{r.chief_complaint ?? "-"}</td>
                <td className="px-4 py-3 text-xs">{r.patient_id}</td>
                <td className="px-4 py-3 text-xs">{r.doctor_patient_id}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">No visits found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
