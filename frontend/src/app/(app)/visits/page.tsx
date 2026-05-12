"use client";

import { useEffect, useRef, useState, FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { CalendarDays, Plus, X, Pencil, Trash2 } from "lucide-react";
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
  // resolved client-side
  patient_name?: string;
  doctor_name?: string;
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
  const isPatient = userRoles.includes("patient") && !userRoles.some((r) => ["admin", "doctor"].includes(r));
  const isDoctor = userRoles.includes("doctor");
  const canCreate = userRoles.some((r) => ["admin", "doctor"].includes(r));
  const canFilterByPatient = userRoles.includes("admin");

  // For patients, always scope to their own patient_id
  const defaultPatientId = isPatient && user?.patient_id ? user.patient_id : presetPatientId;

  const [rows, setRows] = useState<Visit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState(defaultPatientId);

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

  // Edit
  const [showEdit, setShowEdit] = useState(false);
  const [editVisit, setEditVisit] = useState<Visit | null>(null);
  const [editForm, setEditForm] = useState({ visit_type: "consultation", visit_date: "", chief_complaint: "", doctor_notes: "" });
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    if (!isPatient) {
      setSelectedPatientId(presetPatientId);
      setForm((prev) => ({ ...prev, patient_id: presetPatientId || prev.patient_id }));
    }
  }, [presetPatientId]);

  useEffect(() => {
    loadVisits();
  }, [selectedPatientId, language]);

  async function loadVisits() {
    try {
      let url = "/visits?skip=0&limit=100";
      if (selectedPatientId) url += `&patient_id=${selectedPatientId}`;
      if (isDoctor && user?.patient_id) url += `&doctor_patient_id=${user.patient_id}`;
      const data = await api.request<Visit[]>(url);

      // Resolve patient + doctor names in parallel
      const uniquePatientIds = [...new Set(data.map((v) => v.patient_id))];
      const uniqueDoctorIds  = [...new Set(data.map((v) => v.doctor_patient_id))];
      const nameMap = new Map<string, string>();
      await Promise.allSettled([
        ...uniquePatientIds.map((id) =>
          api.request<{ first_name: string; last_name: string }>(`/patients/${id}`)
            .then((p) => nameMap.set(id, `${p.first_name} ${p.last_name}`))
            .catch(() => {})
        ),
        ...uniqueDoctorIds.map((id) =>
          api.request<{ first_name: string; last_name: string }>(`/patients/${id}`)
            .then((p) => nameMap.set(id, `Dr. ${p.first_name} ${p.last_name}`))
            .catch(() => {})
        ),
      ]);

      setRows(data.map((v) => ({
        ...v,
        patient_name: nameMap.get(v.patient_id) ?? "-",
        doctor_name:  nameMap.get(v.doctor_patient_id) ?? "-",
      })));
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("failedToLoadVisits"));
    }
  }

  function openEdit(v: Visit, e: React.MouseEvent) {
    e.stopPropagation();
    setEditVisit(v);
    setEditForm({
      visit_type: v.visit_type,
      visit_date: String(v.visit_date).slice(0, 16),
      chief_complaint: v.chief_complaint ?? "",
      doctor_notes: v.doctor_notes ?? "",
    });
    setEditError(null);
    setShowEdit(true);
  }

  async function handleSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editVisit) return;
    setEditError(null);
    setSaving(true);
    try {
      await api.request(`/visits/${editVisit.visit_id}`, {
        method: "PUT",
        body: JSON.stringify({
          visit_type: editForm.visit_type,
          visit_date: new Date(editForm.visit_date).toISOString(),
          chief_complaint: editForm.chief_complaint || null,
          doctor_notes: editForm.doctor_notes || null,
        }),
      });
      setShowEdit(false);
      setSuccessMsg("Visit updated successfully");
      setTimeout(() => setSuccessMsg(null), 3000);
      await loadVisits();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to update visit");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(visitId: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Delete this visit? This action cannot be undone.")) return;
    try {
      await api.request(`/visits/${visitId}`, { method: "DELETE" });
      setSuccessMsg("Visit deleted");
      setTimeout(() => setSuccessMsg(null), 3000);
      await loadVisits();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete visit");
    }
  }

  async function openCreate() {
    setShowCreate(true);
    // Pre-fill doctor field for logged-in doctors
    if (isDoctor && user?.patient_id) {
      setForm((prev) => ({ ...prev, doctor_patient_id: user.patient_id! }));
    }
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
        title="Visits"
        subtitle={isDoctor ? "Visits assigned to you" : tr("visitsSubtitle")}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(15,23,42,0.45)", backdropFilter: "blur(4px)" }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ duration: 0.22 }}
            className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl border border-primary/10 shadow-2xl"
            style={{ background: "rgba(255,255,255,0.97)", backdropFilter: "blur(20px)" }}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-primary/10 px-6 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-r from-blue-600 to-cyan-500 shadow-md shadow-primary/20">
                  <CalendarDays size={16} className="text-white" />
                </div>
                <h2 className="text-base font-semibold text-slate-800">{tr("createNewVisit")}</h2>
              </div>
              <button
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                onClick={() => setShowCreate(false)}
              >
                <X size={16} />
              </button>
            </div>

            <form className="space-y-5 px-6 py-5" onSubmit={handleCreate}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Patient Search */}
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">{tr("patient")} <span className="text-primary">*</span></label>
                  <div className="relative">
                    <input
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 shadow-sm transition focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15"
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
                      <div className="absolute left-0 right-0 top-full z-[12000] mt-1.5 max-h-52 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
                        {filteredPatients.length > 0 ? filteredPatients.map((p) => (
                          <button
                            key={p.patient_id}
                            type="button"
                            className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-primary/8 hover:text-primary"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setForm((prev) => ({ ...prev, patient_id: p.patient_id }));
                              setPatientQuery(`${p.first_name} ${p.last_name} (${p.cnic})`);
                              setShowPatientOptions(false);
                            }}
                          >
                            <span className="font-medium">{p.first_name} {p.last_name}</span>
                            <span className="ml-1.5 text-slate-400 text-xs">({p.cnic})</span>
                          </button>
                        )) : (
                          <div className="px-3 py-2.5 text-xs text-slate-400 text-center">No matching patients</div>
                        )}
                      </div>
                    )}
                  </div>
                  {patientsError && <p className="mt-1 text-xs text-red-500">{patientsError}</p>}
                </div>

                {/* Doctor Select */}
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">{tr("doctor")} <span className="text-primary">*</span></label>
                  <select
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm transition focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15"
                    value={form.doctor_patient_id}
                    onChange={(e) => setForm({ ...form, doctor_patient_id: e.target.value })}
                    required
                  >
                    <option value="" className="text-slate-400">{tr("selectDoctorOption")}</option>
                    {doctors.map((d) => (
                      <option key={d.patient_id} value={d.patient_id}>
                        Dr. {d.first_name} {d.last_name}{d.specialization ? ` (${d.specialization})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Visit Type */}
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">{tr("visitType")} <span className="text-primary">*</span></label>
                  <select
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm transition focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15"
                    value={form.visit_type}
                    onChange={(e) => setForm({ ...form, visit_type: e.target.value })}
                  >
                    {VISIT_TYPES.map((t) => (
                      <option key={t} value={t}>{t.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}</option>
                    ))}
                  </select>
                </div>

                {/* Visit Date */}
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">{tr("visitDateTime")} <span className="text-primary">*</span></label>
                  <input
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm transition focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15"
                    type="datetime-local"
                    value={form.visit_date}
                    onChange={(e) => setForm({ ...form, visit_date: e.target.value })}
                    required
                  />
                </div>
              </div>

              {/* Chief Complaint */}
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">{tr("chiefComplaint")}</label>
                <textarea
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 shadow-sm transition focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15 min-h-[84px] resize-none"
                  value={form.chief_complaint}
                  onChange={(e) => setForm({ ...form, chief_complaint: e.target.value })}
                  placeholder={tr("chiefComplaintPlaceholder")}
                />
              </div>

              {/* Doctor Notes */}
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">{tr("doctorNotes")}</label>
                <textarea
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 shadow-sm transition focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15 min-h-[84px] resize-none"
                  value={form.doctor_notes}
                  onChange={(e) => setForm({ ...form, doctor_notes: e.target.value })}
                  placeholder={tr("doctorNotesPlaceholder")}
                />
              </div>

              {createError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                  {createError}
                </div>
              )}

              {/* Footer Buttons */}
              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:border-slate-300"
                  onClick={() => setShowCreate(false)}
                >
                  {tr("cancel")}
                </button>
                <button className="btn-primary" type="submit" disabled={creating}>
                  {creating ? tr("creating") : tr("createVisit")}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Edit Visit Modal */}
      {showEdit && editVisit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(15,23,42,0.45)", backdropFilter: "blur(4px)" }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ duration: 0.22 }}
            className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl border border-primary/10 shadow-2xl"
            style={{ background: "rgba(255,255,255,0.97)", backdropFilter: "blur(20px)" }}
          >
            <div className="flex items-center justify-between border-b border-primary/10 px-6 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-r from-blue-600 to-cyan-500 shadow-md shadow-primary/20">
                  <Pencil size={14} className="text-white" />
                </div>
                <h2 className="text-base font-semibold text-slate-800">Edit Visit</h2>
              </div>
              <button className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-100" onClick={() => setShowEdit(false)}>
                <X size={16} />
              </button>
            </div>
            <form className="space-y-5 px-6 py-5" onSubmit={handleSaveEdit}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">{tr("visitType")}</label>
                  <select className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm transition focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15"
                    value={editForm.visit_type} onChange={(e) => setEditForm({ ...editForm, visit_type: e.target.value })}>
                    {VISIT_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">{tr("visitDateTime")}</label>
                  <input type="datetime-local" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm transition focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15"
                    value={editForm.visit_date} onChange={(e) => setEditForm({ ...editForm, visit_date: e.target.value })} required />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">{tr("chiefComplaint")}</label>
                <textarea className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 shadow-sm transition focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15 min-h-[80px] resize-none"
                  value={editForm.chief_complaint} onChange={(e) => setEditForm({ ...editForm, chief_complaint: e.target.value })} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">{tr("doctorNotes")}</label>
                <textarea className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 shadow-sm transition focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15 min-h-[80px] resize-none"
                  value={editForm.doctor_notes} onChange={(e) => setEditForm({ ...editForm, doctor_notes: e.target.value })} />
              </div>
              {editError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{editError}</div>}
              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button type="button" className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50" onClick={() => setShowEdit(false)}>{tr("cancel")}</button>
                <button className="btn-primary" type="submit" disabled={saving}>{saving ? "Saving..." : "Save Changes"}</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Visits Table */}
      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[1000px] text-sm">
          <thead className="table-header">
            <tr>
              <th className="px-4 py-3 text-left">{tr("date")}</th>
              <th className="px-4 py-3 text-left">{tr("patient")}</th>
              <th className="px-4 py-3 text-left">{tr("doctor")}</th>
              <th className="px-4 py-3 text-left">{tr("type")}</th>
              <th className="px-4 py-3 text-left">{tr("chiefComplaint")}</th>
              {canCreate && <th className="px-4 py-3 text-left">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.visit_id}
                className="table-row cursor-pointer hover:bg-background/50 transition"
                onClick={() => router.push(`/visits/${r.visit_id}`)}
              >
                <td className="px-4 py-3 whitespace-nowrap">{String(r.visit_date).slice(0, 16).replace("T", " ")}</td>
                <td className="px-4 py-3 font-medium text-slate-800">{r.patient_name ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{r.doctor_name ?? "-"}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary font-semibold">
                    {r.visit_type.replace(/_/g, " ")}
                  </span>
                </td>
                <td className="px-4 py-3 max-w-[220px] truncate">{r.chief_complaint ?? "-"}</td>
                {canCreate && (
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-2">
                      <button className="p-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition" onClick={(e) => openEdit(r, e)} title="Edit"><Pencil size={14} /></button>
                      <button className="p-1.5 rounded-lg bg-danger/10 text-danger hover:bg-danger/20 transition" onClick={(e) => handleDelete(r.visit_id, e)} title="Delete"><Trash2 size={14} /></button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={canCreate ? 6 : 5} className="px-4 py-8 text-center text-slate-600 font-medium">{tr("noVisitsFound")}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
