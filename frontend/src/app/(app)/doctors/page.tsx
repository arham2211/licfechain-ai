"use client";

import { useEffect, useState, FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Stethoscope, Plus, X, Pencil, Trash2, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api-client";
import { getUser } from "@/lib/auth-store";
import { useLanguage } from "@/components/providers/LanguageProvider";

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

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

export default function DoctorsPage() {
  const { tr } = useLanguage();
  const user = getUser();
  const userRoles = user?.roles ?? [];
  const canCreate = userRoles.includes("admin");
  const canEdit = userRoles.some((r) => ["admin"].includes(r));

  const [rows, setRows] = useState<Doctor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState<string | null>(null);

  function generatePassword(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
    return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  }

  // Create form
  const [form, setForm] = useState({
    first_name: "", last_name: "", cnic: "", date_of_birth: "",
    gender: "male", blood_group: "O+", phone: "", email: "", address: "",
    specialization: "", license_number: "", hospital_affiliation: "",
    password: "",
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

  function openCreate() {
    setForm({ first_name: "", last_name: "", cnic: "", date_of_birth: "", gender: "male", blood_group: "O+", phone: "", email: "", address: "", specialization: "", license_number: "", hospital_affiliation: "", password: generatePassword() });
    setCreateError(null);
    setShowCreate(true);
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      // 1. Create the patient record
      const { first_name, last_name, cnic, date_of_birth, gender, blood_group, phone, email, address, specialization, license_number, hospital_affiliation, password } = form;
      if (!password || password.length < 8) throw new Error("Password must be at least 8 characters");
      if (!email) throw new Error("Email is required to create a doctor login account");
      const newPatient = await api.request<{ patient_id: string }>("/patients/", {
        method: "POST",
        body: JSON.stringify({ first_name, last_name, cnic, date_of_birth, gender, blood_group, phone: phone || undefined, email: email || undefined, address: address || undefined }),
      });
      // 2. Promote to doctor
      await api.request("/doctors/", {
        method: "POST",
        body: JSON.stringify({ patient_id: newPatient.patient_id, specialization, license_number, hospital_affiliation: hospital_affiliation || undefined }),
      });
      // 3. Create login account
      const username = email.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "") || `${first_name.toLowerCase()}${last_name.toLowerCase()}`;
      await api.request("/auth/register", {
        method: "POST",
        body: JSON.stringify({ username, email, password, patient_id: newPatient.patient_id, role: "doctor" }),
      });
      // 4. Email credentials to admin
      await api.request("/auth/send-credentials", {
        method: "POST",
        body: JSON.stringify({ name: `${first_name} ${last_name}`, email, username, password, role: "doctor" }),
      }).catch(() => {}); // non-blocking — don't fail if SMTP not configured
      setShowCreate(false);
      setSuccessMsg("Doctor created successfully — credentials emailed");
      setTimeout(() => setSuccessMsg(null), 4000);
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
    if (!confirm("Remove all doctor functionality for this person? Their patient record will remain, but doctor access and doctor-specific details will be removed.")) return;
    try {
      await api.request(`/doctors/${doctorId}`, { method: "DELETE" });
      setSuccessMsg("Doctor functionality removed");
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
                <Plus size={16} /> Create Doctor
              </button>
            )}
          </div>
        }
      />

      {error && <div className="card p-4 text-sm text-danger">{error}</div>}
      {successMsg && <div className="alert-success">{successMsg}</div>}

      {/* Create Doctor Modal */}
      <AnimatePresence>
        {showCreate && (
          <div className="modal-overlay z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              transition={{ duration: 0.2 }}
              className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-white/70 bg-white/90 shadow-[0_30px_90px_rgba(2,132,199,0.18)] backdrop-blur-2xl"
            >
              <div className="absolute inset-x-0 top-0 h-1 rounded-t-3xl bg-linear-to-r from-primary-500 via-cyan-400 to-sky-300" />
              <div className="p-7">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                      <Stethoscope size={18} className="text-primary" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-slate-900">Create Doctor</h2>
                      <p className="text-xs text-slate-400 mt-0.5">Fill in personal details and medical credentials.</p>
                    </div>
                  </div>
                  <button
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-700"
                    onClick={() => setShowCreate(false)}
                  >
                    <X size={16} />
                  </button>
                </div>

                <form className="space-y-5" onSubmit={handleCreate}>
                  {/* Section: Personal Info */}
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Personal Information</p>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">First Name *</label>
                      <input className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition focus:border-primary/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                        value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} required placeholder="John" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Last Name *</label>
                      <input className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition focus:border-primary/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                        value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} required placeholder="Doe" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">CNIC *</label>
                      <input className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition focus:border-primary/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                        value={form.cnic} onChange={(e) => setForm({ ...form, cnic: e.target.value })} required placeholder="12345-1234567-1" pattern="\d{5}-\d{7}-\d{1}" title="Format: XXXXX-XXXXXXX-X" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Date of Birth *</label>
                      <input className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition focus:border-primary/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                        type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} required />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Gender *</label>
                      <select className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 transition focus:border-primary/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                        value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Blood Group *</label>
                      <select className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 transition focus:border-primary/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                        value={form.blood_group} onChange={(e) => setForm({ ...form, blood_group: e.target.value })}>
                        {BLOOD_GROUPS.map((bg) => <option key={bg} value={bg}>{bg}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Phone *</label>
                      <input className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition focus:border-primary/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                        value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required placeholder="03001234567" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Email *</label>
                      <input className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition focus:border-primary/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                        type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required placeholder="doctor@hospital.com" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Address</label>
                      <input className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition focus:border-primary/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                        value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="123 Main Street, Karachi" />
                    </div>
                  </div>

                  {/* Login Credentials */}
                  <div className="border-t border-slate-100 pt-1">
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Login Credentials</p>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Password *</label>
                    <div className="flex gap-2">
                      <input
                        className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-mono text-slate-900 placeholder-slate-400 transition focus:border-primary/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                        type="text"
                        value={form.password}
                        onChange={(e) => setForm({ ...form, password: e.target.value })}
                        required
                        minLength={8}
                        placeholder="Min 8 characters"
                      />
                      <button
                        type="button"
                        title="Generate random password"
                        className="flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs font-semibold text-primary transition hover:bg-primary/10"
                        onClick={() => setForm({ ...form, password: generatePassword() })}
                      >
                        <RefreshCw size={14} />
                        Generate
                      </button>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">This password will be emailed to the admin. The doctor uses their email to log in.</p>
                  </div>

                  {/* Divider */}
                  <div className="border-t border-slate-100 pt-1">
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Medical Credentials</p>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Specialization *</label>
                      <input className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition focus:border-primary/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                        value={form.specialization} onChange={(e) => setForm({ ...form, specialization: e.target.value })} required placeholder="e.g., Endocrinologist" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">License Number *</label>
                      <input className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition focus:border-primary/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                        value={form.license_number} onChange={(e) => setForm({ ...form, license_number: e.target.value })} required placeholder="e.g., PMC-12345" />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Hospital Affiliation</label>
                    <input className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition focus:border-primary/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                      value={form.hospital_affiliation} onChange={(e) => setForm({ ...form, hospital_affiliation: e.target.value })} placeholder="e.g., Aga Khan University Hospital" />
                  </div>

                  {createError && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{createError}</div>
                  )}

                  <div className="flex justify-end gap-3 pt-2">
                    <button type="button" className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50" onClick={() => setShowCreate(false)}>Cancel</button>
                    <button className="btn-primary rounded-xl px-5 py-2.5 text-sm" type="submit" disabled={creating}>{creating ? "Creating..." : "Create Doctor"}</button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Doctor Modal */}
      {showEdit && (
        <div className="modal-overlay">
          <div className="card w-full max-w-lg p-0">
            <div className="flex items-center justify-between bg-linear-to-r from-primary to-cyan-500 px-6 py-4 rounded-t-xl">
              <div>
                <h2 className="text-lg font-bold text-white">Edit Doctor</h2>
                <p className="text-xs text-white/70 mt-0.5">Update doctor credentials and affiliation.</p>
              </div>
              <button className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition" onClick={() => setShowEdit(null)}><X size={18} /></button>
            </div>
            <form className="p-6 space-y-4" onSubmit={handleSaveEdit}>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">Specialization</label>
                <input className="input" value={editForm.specialization} onChange={(e) => setEditForm({ ...editForm, specialization: e.target.value })} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">License Number</label>
                <input className="input" value={editForm.license_number} onChange={(e) => setEditForm({ ...editForm, license_number: e.target.value })} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">Hospital Affiliation</label>
                <input className="input" value={editForm.hospital_affiliation} onChange={(e) => setEditForm({ ...editForm, hospital_affiliation: e.target.value })} />
              </div>
              {editError && <p className="text-sm text-danger">{editError}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className="btn-ghost text-sm" onClick={() => setShowEdit(null)}>Cancel</button>
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
              <tr key={r.patient_id} className="table-row hover:bg-primary/5 transition">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary/10 text-primary font-bold text-sm flex items-center justify-center shrink-0 uppercase">
                      {(r.first_name?.[0] ?? "") + (r.last_name?.[0] ?? "")}
                    </div>
                    <div>
                      <div className="font-semibold text-slate-800">{r.first_name} {r.last_name}</div>
                      {r.phone && <div className="text-xs text-slate-400">{r.phone}</div>}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {r.specialization
                    ? <span className="badge bg-primary/15 text-primary">{r.specialization}</span>
                    : <span className="text-slate-400">-</span>}
                </td>
                <td className="px-4 py-3 font-mono text-slate-700">{r.license_number ?? "-"}</td>
                <td className="px-4 py-3 text-slate-700">{r.hospital_affiliation ?? "-"}</td>
                {canEdit && (
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button className="p-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition" onClick={() => startEdit(r)} title="Edit"><Pencil size={14} /></button>
                      <button className="p-1.5 rounded-lg bg-danger/10 text-danger hover:bg-danger/20 transition" onClick={() => handleDelete(r.patient_id)} title="Remove"><Trash2 size={14} /></button>
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
