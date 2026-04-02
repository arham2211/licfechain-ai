"use client";

import { useEffect, useState, FormEvent } from "react";
import { motion } from "framer-motion";
import { Stethoscope, Plus, X, Pencil, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api-client";
import { getUser } from "@/lib/auth-store";

type Doctor = {
  patient_id: string;
  first_name: string;
  last_name: string;
  specialization?: string;
  hospital_affiliation?: string;
  license_number?: string;
  cnic?: string;
  phone?: string;
};

type PatientOption = {
  patient_id: string;
  first_name: string;
  last_name: string;
  cnic: string;
};

export default function DoctorsPage() {
  const user = getUser();
  const userRoles = user?.roles ?? [];
  const canCreate = userRoles.includes("admin");
  const canEdit = userRoles.some((r) => ["admin"].includes(r));

  const [rows, setRows] = useState<Doctor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState<string | null>(null);

  // Create form
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [form, setForm] = useState({
    patient_id: "",
    specialization: "",
    license_number: "",
    hospital_affiliation: "",
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit form
  const [editForm, setEditForm] = useState({
    specialization: "",
    license_number: "",
    hospital_affiliation: "",
  });
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    loadDoctors();
  }, [search]);

  async function loadDoctors() {
    try {
      const searchParam = search ? `&search=${encodeURIComponent(search)}` : "";
      const data = await api.request<Doctor[]>(`/doctors?skip=0&limit=100${searchParam}`);
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load doctors");
    }
  }

  async function loadPatients() {
    try {
      const data = await api.request<PatientOption[]>("/patients?skip=0&limit=500");
      setPatients(data);
    } catch {
      // silently fail
    }
  }

  function openCreate() {
    setShowCreate(true);
    loadPatients();
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      await api.request("/doctors/", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setShowCreate(false);
      setForm({ patient_id: "", specialization: "", license_number: "", hospital_affiliation: "" });
      setSuccessMsg("Doctor registered successfully");
      setTimeout(() => setSuccessMsg(null), 3000);
      await loadDoctors();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Failed to create doctor");
    } finally {
      setCreating(false);
    }
  }

  function startEdit(doc: Doctor) {
    setEditForm({
      specialization: doc.specialization ?? "",
      license_number: doc.license_number ?? "",
      hospital_affiliation: doc.hospital_affiliation ?? "",
    });
    setShowEdit(doc.patient_id);
    setEditError(null);
  }

  async function handleSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!showEdit) return;
    setEditError(null);
    setSaving(true);
    try {
      await api.request(`/doctors/${showEdit}`, {
        method: "PUT",
        body: JSON.stringify(editForm),
      });
      setShowEdit(null);
      setSuccessMsg("Doctor updated successfully");
      setTimeout(() => setSuccessMsg(null), 3000);
      await loadDoctors();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Failed to update doctor");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(doctorId: string) {
    if (!confirm("Remove doctor status from this patient? The patient record will be preserved.")) return;
    try {
      await api.request(`/doctors/${doctorId}`, { method: "DELETE" });
      setSuccessMsg("Doctor status removed");
      setTimeout(() => setSuccessMsg(null), 3000);
      await loadDoctors();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete doctor");
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="space-y-4">
      <PageHeader
        title="Doctors"
        subtitle="Provider directory with specializations and affiliations."
        icon={<Stethoscope size={20} />}
        right={
          <div className="flex items-center gap-2">
            <input
              className="input w-64"
              placeholder="Search doctors..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {canCreate && (
              <button className="btn-primary whitespace-nowrap" onClick={openCreate}>
                <Plus size={16} /> Register Doctor
              </button>
            )}
          </div>
        }
      />

      {error ? <div className="card p-4 text-sm text-danger">{error}</div> : null}
      {successMsg && (
        <div className="alert-success">{successMsg}</div>
      )}

      {/* Create Doctor Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="card w-full max-w-lg p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Register Doctor</h2>
              <button className="rounded-md border border-border px-3 py-1 text-sm" onClick={() => setShowCreate(false)}><X size={16} /></button>
            </div>
            <p className="mt-1 text-xs text-muted">Promote an existing patient to doctor by adding medical credentials.</p>
            <form className="mt-4 space-y-4" onSubmit={handleCreate}>
              <div>
                <label className="mb-1 block text-sm font-medium">Select Patient *</label>
                <select
                  className="input"
                  value={form.patient_id}
                  onChange={(e) => setForm({ ...form, patient_id: e.target.value })}
                  required
                >
                  <option value="">-- Select a patient --</option>
                  {patients.map((p) => (
                    <option key={p.patient_id} value={p.patient_id}>
                      {p.first_name} {p.last_name} ({p.cnic})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Specialization *</label>
                <input
                  className="input"
                  value={form.specialization}
                  onChange={(e) => setForm({ ...form, specialization: e.target.value })}
                  required
                  placeholder="e.g., Endocrinologist, Nephrologist"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">License Number *</label>
                <input
                  className="input"
                  value={form.license_number}
                  onChange={(e) => setForm({ ...form, license_number: e.target.value })}
                  required
                  placeholder="e.g., PMC-12345"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Hospital Affiliation</label>
                <input
                  className="input"
                  value={form.hospital_affiliation}
                  onChange={(e) => setForm({ ...form, hospital_affiliation: e.target.value })}
                  placeholder="e.g., Aga Khan University Hospital"
                />
              </div>
              {createError ? <p className="text-sm text-danger">{createError}</p> : null}
              <div className="flex justify-end gap-2">
                <button type="button" className="rounded-md border border-border px-4 py-2 text-sm" onClick={() => setShowCreate(false)}>Cancel</button>
                <button className="btn-primary" type="submit" disabled={creating}>{creating ? "Registering..." : "Register Doctor"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Doctor Modal */}
      {showEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="card w-full max-w-lg p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Edit Doctor</h2>
              <button className="rounded-md border border-border px-3 py-1 text-sm" onClick={() => setShowEdit(null)}><X size={16} /></button>
            </div>
            <form className="mt-4 space-y-4" onSubmit={handleSaveEdit}>
              <div>
                <label className="mb-1 block text-sm font-medium">Specialization</label>
                <input className="input" value={editForm.specialization} onChange={(e) => setEditForm({ ...editForm, specialization: e.target.value })} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">License Number</label>
                <input className="input" value={editForm.license_number} onChange={(e) => setEditForm({ ...editForm, license_number: e.target.value })} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Hospital Affiliation</label>
                <input className="input" value={editForm.hospital_affiliation} onChange={(e) => setEditForm({ ...editForm, hospital_affiliation: e.target.value })} />
              </div>
              {editError ? <p className="text-sm text-danger">{editError}</p> : null}
              <div className="flex justify-end gap-2">
                <button type="button" className="rounded-md border border-border px-4 py-2 text-sm" onClick={() => setShowEdit(null)}>Cancel</button>
                <button className="btn-primary" type="submit" disabled={saving}>{saving ? "Saving..." : "Save Changes"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Doctors Table */}
      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[800px] text-sm">
          <thead className="table-header">
            <tr>
              <th className="px-4 py-3 text-left">Doctor</th>
              <th className="px-4 py-3 text-left">Specialization</th>
              <th className="px-4 py-3 text-left">License #</th>
              <th className="px-4 py-3 text-left">Affiliation</th>
              {canEdit && <th className="px-4 py-3 text-left">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.patient_id} className="table-row">
                <td className="px-4 py-3 font-medium">{r.first_name} {r.last_name}</td>
                <td className="px-4 py-3">{r.specialization ?? "-"}</td>
                <td className="px-4 py-3">{r.license_number ?? "-"}</td>
                <td className="px-4 py-3">{r.hospital_affiliation ?? "-"}</td>
                {canEdit && (
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button className="text-primary hover:text-primary/80 transition" onClick={() => startEdit(r)}><Pencil size={14} /></button>
                      <button className="text-danger hover:text-danger/80 transition" onClick={() => handleDelete(r.patient_id)}><Trash2 size={14} /></button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={canEdit ? 5 : 4} className="px-4 py-8 text-center text-muted">No doctors found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
