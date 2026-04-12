"use client";

import { useEffect, useRef, useState, FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { CalendarDays, Plus, X } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PatientSearch } from "@/components/ui/PatientSearch";
import { api } from "@/lib/api-client";
import { getUser } from "@/lib/auth-store";
import { useLanguage } from "@/components/providers/LanguageProvider";

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
  const { tr, language } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const presetPatientId = searchParams.get("patient_id") ?? "";

  const user = getUser();
  const userRoles = user?.roles ?? [];
  const canCreate = userRoles.some((r) => ["admin", "doctor"].includes(r));
  const canFilterByPatient = userRoles.some((r) => ["admin", "doctor"].includes(r));

  const [rows, setRows] = useState<Visit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState(presetPatientId);

  // Create form
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(false);
  const [patientsError, setPatientsError] = useState<string | null>(null);
  const [patientQuery, setPatientQuery] = useState("");
  const [showPatientOptions, setShowPatientOptions] = useState(false);
  const patientSearchRequestId = useRef(0);
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
    setSelectedPatientId(presetPatientId);
    setForm((prev) => ({ ...prev, patient_id: presetPatientId || prev.patient_id }));
  }, [presetPatientId]);

  useEffect(() => {
    loadVisits();
  }, [selectedPatientId, language]);

  async function loadVisits() {
    try {
      let url = "/visits?skip=0&limit=100";
      if (selectedPatientId) url += `&patient_id=${selectedPatientId}`;
      const data = await api.request<Visit[]>(url);
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("failedToLoadVisits"));
    }
  }

  async function openCreate() {
    setShowCreate(true);
    try {
      const d = await api.request<DoctorOption[]>("/doctors?skip=0&limit=200");
      setDoctors(d);
    } catch {
      // silently fail
    }
  }

  async function loadPatientsForSelection(searchQuery = "") {
    const requestId = ++patientSearchRequestId.current;
    setPatientsLoading(true);
    setPatientsError(null);
    try {
      const q = searchQuery.trim();
      const searchPart = q ? `&search=${encodeURIComponent(q)}` : "";
      const p = await api.request<PatientOption[]>(`/patients/?skip=0&limit=20${searchPart}`);
      if (requestId !== patientSearchRequestId.current) return;
      setPatients(p);
    } catch (e) {
      if (requestId !== patientSearchRequestId.current) return;
      setPatients([]);
      setPatientsError(e instanceof Error ? e.message : tr("failed"));
    } finally {
      if (requestId !== patientSearchRequestId.current) return;
      setPatientsLoading(false);
    }
  }

  useEffect(() => {
    if (!showCreate) return;
    const timer = setTimeout(() => {
      loadPatientsForSelection(patientQuery);
    }, 250);
    return () => clearTimeout(timer);
  }, [showCreate, patientQuery]);

  const filteredPatients = patients
    .filter((p) => {
      const q = patientQuery.trim().toLowerCase();
      if (!q) return true;
      const full = `${p.first_name} ${p.last_name}`.toLowerCase();
      return full.includes(q) || p.cnic.toLowerCase().includes(q);
    })
    .slice(0, 20);

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
      setSuccessMsg(tr("visitCreatedSuccessfully"));
      setTimeout(() => setSuccessMsg(null), 3000);
      await loadVisits();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : tr("failedToCreateVisit"));
    } finally {
      setCreating(false);
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="space-y-4">
      <PageHeader
        title={tr("visits")}
        subtitle={tr("visitsSubtitle")}
        icon={<CalendarDays size={20} />}
        right={
          <div className="flex flex-col md:flex-row items-end md:items-center gap-2">
            {canFilterByPatient && (
              <div className="flex items-center gap-2">
                <PatientSearch onSelect={setSelectedPatientId} className="w-64" />
                {selectedPatientId && (
                  <button
                    className="rounded-md border border-border px-3 py-2 text-sm"
                    onClick={() => setSelectedPatientId("")}
                  >
                    All
                  </button>
                )}
              </div>
            )}
            {canCreate && (
              <button className="btn-primary" onClick={openCreate}>
                <Plus size={16} /> {tr("newVisit")}
              </button>
            )}
          </div>
        }
      />

      {error ? <div className="card p-4 text-sm text-danger">{error}</div> : null}
      {successMsg && <div className="alert-success">{successMsg}</div>}

      {/* Create Visit Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="card w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{tr("createNewVisit")}</h2>
              <button className="rounded-md border border-border px-3 py-1 text-sm" onClick={() => setShowCreate(false)}><X size={16} /></button>
            </div>
            <form className="mt-4 space-y-4" onSubmit={handleCreate}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium">{tr("patient")} *</label>
                  <div className="relative">
                    <input
                      className="input w-full"
                      value={patientQuery}
                      onChange={(e) => {
                        setPatientQuery(e.target.value);
                        setForm((prev) => ({ ...prev, patient_id: "" }));
                        setShowPatientOptions(true);
                      }}
                      onFocus={() => setShowPatientOptions(true)}
                      onBlur={() => setTimeout(() => setShowPatientOptions(false), 120)}
                      placeholder={patientsLoading ? tr("loading") : tr("searchByNameOrCnic")}
                      disabled={patientsLoading}
                      required={!form.patient_id}
                    />
                    {showPatientOptions && !patientsLoading && (
                      <div className="absolute left-0 right-0 top-full z-[12000] mt-2 max-h-56 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-1 shadow-2xl">
                        {filteredPatients.length > 0 ? filteredPatients.map((p) => (
                          <button
                            key={p.patient_id}
                            type="button"
                            className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-100 hover:bg-slate-800 transition"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setForm((prev) => ({ ...prev, patient_id: p.patient_id }));
                              setPatientQuery(`${p.first_name} ${p.last_name} (${p.cnic})`);
                              setShowPatientOptions(false);
                            }}
                          >
                            {p.first_name} {p.last_name} ({p.cnic})
                          </button>
                        )) : <div className="px-3 py-2 text-xs text-slate-400">No matching patients</div>}
                      </div>
                    )}
                  </div>
                  {patientsError && <p className="mt-1 text-xs text-danger">{patientsError}</p>}
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">{tr("doctor")} *</label>
                  <select className="input" value={form.doctor_patient_id} onChange={(e) => setForm({ ...form, doctor_patient_id: e.target.value })} required>
                    <option value="">{tr("selectDoctorOption")}</option>
                    {doctors.map((d) => (
                      <option key={d.patient_id} value={d.patient_id}>Dr. {d.first_name} {d.last_name}{d.specialization ? ` (${d.specialization})` : ""}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium">{tr("visitType")} *</label>
                  <select className="input" value={form.visit_type} onChange={(e) => setForm({ ...form, visit_type: e.target.value })}>
                    {VISIT_TYPES.map((t) => (
                      <option key={t} value={t}>{t.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">{tr("visitDateTime")} *</label>
                  <input className="input" type="datetime-local" value={form.visit_date} onChange={(e) => setForm({ ...form, visit_date: e.target.value })} required />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">{tr("chiefComplaint")}</label>
                <textarea className="input min-h-[80px]" value={form.chief_complaint} onChange={(e) => setForm({ ...form, chief_complaint: e.target.value })} placeholder={tr("chiefComplaintPlaceholder")} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">{tr("doctorNotes")}</label>
                <textarea className="input min-h-[80px]" value={form.doctor_notes} onChange={(e) => setForm({ ...form, doctor_notes: e.target.value })} placeholder={tr("doctorNotesPlaceholder")} />
              </div>
              {createError ? <p className="text-sm text-danger">{createError}</p> : null}
              <div className="flex justify-end gap-2">
                <button type="button" className="rounded-md border border-border px-4 py-2 text-sm" onClick={() => setShowCreate(false)}>{tr("cancel")}</button>
                <button className="btn-primary" type="submit" disabled={creating}>{creating ? tr("creating") : tr("createVisit")}</button>
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
              <th className="px-4 py-3 text-left">{tr("date")}</th>
              <th className="px-4 py-3 text-left">{tr("type")}</th>
              <th className="px-4 py-3 text-left">{tr("chiefComplaint")}</th>
              <th className="px-4 py-3 text-left">{tr("patientId")}</th>
              <th className="px-4 py-3 text-left">{tr("doctorId")}</th>
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
                <td colSpan={5} className="px-4 py-8 text-center text-muted">{tr("noVisitsFound")}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
