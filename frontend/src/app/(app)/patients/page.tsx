"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Users, Plus, X } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api-client";
import { getUser } from "@/lib/auth-store";
import { useLanguage } from "@/components/providers/LanguageProvider";

type Patient = {
  patient_id: string;
  cnic: string;
  first_name: string;
  last_name: string;
  gender: string;
  date_of_birth: string;
  blood_group?: string;
  phone?: string;
  email?: string;
  address?: string;
  is_doctor?: boolean;
};

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

export default function PatientsPage() {
  const { tr, language } = useLanguage();
  const router = useRouter();
  const user = getUser();
  const userRoles = user?.roles ?? [];
  const [localViewMode, setLocalViewMode] = useState<"clinical" | "personal">("clinical");
  const isPatient = userRoles.includes("patient") || (userRoles.includes("doctor") && localViewMode === "personal");
  const canCreate = userRoles.includes("admin");

  /* If patient role → redirect to their own profile page */
  useEffect(() => {
    if (isPatient && user?.patient_id) {
      router.replace(`/patients/${user.patient_id}`);
    }
  }, [isPatient, user?.patient_id, router]);

  const [patients, setPatients] = useState<Patient[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const [form, setForm] = useState({
    first_name: "", last_name: "", cnic: "", date_of_birth: "",
    gender: "male", blood_group: "O+", phone: "", email: "", address: "",
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (!isPatient) loadPatients();
  }, [search, isPatient, language]);

  async function loadPatients() {
    try {
      const data = await api.request<Patient[]>(
        `/patients?skip=0&limit=100&search=${encodeURIComponent(search)}`
      );
      setPatients(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("failedToLoadPatients"));
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      await api.request<Patient>("/patients/", { method: "POST", body: JSON.stringify(form) });
      setShowCreate(false);
      setForm({ first_name: "", last_name: "", cnic: "", date_of_birth: "", gender: "male", blood_group: "O+", phone: "", email: "", address: "" });
      await loadPatients();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : tr("failedToCreatePatient"));
    } finally {
      setCreating(false);
    }
  }

  /* If patient → show loading while redirect happens */
  if (isPatient) {
    return <div className="card p-8 text-center text-muted animate-in">{tr("redirectingToProfile")}</div>;
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="space-y-4">
      <PageHeader title={isPatient ? tr("myProfile") : tr("patients")} subtitle={isPatient ? tr("personalRecordSubtitle") : tr("patientsSubtitle")}
        icon={<Users size={20} />}
        right={
          <div className="flex flex-col md:flex-row items-end md:items-center gap-4">
            {!isPatient && (
              <div className="flex items-center gap-2">
                <input className="input w-64" placeholder={tr("searchByNameOrCnic")} value={search} onChange={(e) => setSearch(e.target.value)} />
                {canCreate && <button className="btn-primary whitespace-nowrap" onClick={() => setShowCreate(true)}><Plus size={16} /> {tr("newPatient")}</button>}
              </div>
            )}

            {user?.roles.includes("doctor") && user?.patient_id && (
              <div className="flex items-center gap-1 rounded-full bg-slate-100 p-1">
                <button
                  onClick={() => setLocalViewMode("clinical")}
                  className={`px-3 py-1.5 text-xs font-bold rounded-full transition ${localViewMode === "clinical" ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                >
                  {tr("patients")}
                </button>
                <button
                  onClick={() => setLocalViewMode("personal")}
                  className={`px-3 py-1.5 text-xs font-bold rounded-full transition ${localViewMode === "personal" ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-emerald-500"}`}
                >
                  {tr("personal")}
                </button>
              </div>
            )}
          </div>
        }
      />

      {error && <div className="card p-4 text-sm text-danger">{error}</div>}

      {showCreate && (
        <div className="modal-overlay">
          <div className="card w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{tr("registerNewPatient")}</h2>
              <button className="btn-ghost text-sm" onClick={() => setShowCreate(false)}><X size={16} /></button>
            </div>
            <form className="mt-4 space-y-4" onSubmit={handleCreate}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div><label className="mb-1 block text-sm font-medium">{tr("firstName")} *</label><input className="input" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} required placeholder="John" /></div>
                <div><label className="mb-1 block text-sm font-medium">{tr("lastName")} *</label><input className="input" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} required placeholder="Doe" /></div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div><label className="mb-1 block text-sm font-medium">{tr("cnic")} *</label><input className="input" value={form.cnic} onChange={(e) => setForm({ ...form, cnic: e.target.value })} required placeholder="12345-1234567-1" pattern="\d{5}-\d{7}-\d{1}" title="Format: XXXXX-XXXXXXX-X" /></div>
                <div><label className="mb-1 block text-sm font-medium">{tr("dateOfBirth")} *</label><input className="input" type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} required /></div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div><label className="mb-1 block text-sm font-medium">{tr("gender")} *</label><select className="input" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}><option value="male">{tr("male")}</option><option value="female">{tr("female")}</option><option value="other">{tr("other")}</option></select></div>
                <div><label className="mb-1 block text-sm font-medium">{tr("bloodGroup")} *</label><select className="input" value={form.blood_group} onChange={(e) => setForm({ ...form, blood_group: e.target.value })}>{BLOOD_GROUPS.map((bg) => <option key={bg} value={bg}>{bg}</option>)}</select></div>
                <div><label className="mb-1 block text-sm font-medium">{tr("phone")} *</label><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required placeholder="03001234567" /></div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div><label className="mb-1 block text-sm font-medium">{tr("email")}</label><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="john@example.com" /></div>
                <div><label className="mb-1 block text-sm font-medium">{tr("address")}</label><input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="123 Main Street, Karachi" /></div>
              </div>
              {createError && <p className="text-sm text-danger">{createError}</p>}
              <div className="flex justify-end gap-2">
                <button type="button" className="btn-ghost text-sm" onClick={() => setShowCreate(false)}>{tr("cancel")}</button>
                <button className="btn-primary" type="submit" disabled={creating}>{creating ? tr("creating") : tr("createPatient")}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[800px] text-sm">
          <thead className="table-header">
            <tr>
              <th className="px-4 py-3 text-left">{tr("name")}</th>
              <th className="px-4 py-3 text-left">{tr("cnic")}</th>
              <th className="px-4 py-3 text-left">{tr("gender")}</th>
              <th className="px-4 py-3 text-left">{tr("dateOfBirthShort")}</th>
              <th className="px-4 py-3 text-left">{tr("blood")}</th>
              <th className="px-4 py-3 text-left">{tr("phone")}</th>
              <th className="px-4 py-3 text-left">{tr("role")}</th>
            </tr>
          </thead>
          <tbody>
            {patients.map((p) => (
              <tr key={p.patient_id} className="table-row cursor-pointer hover:bg-primary/5 transition" onClick={() => router.push(`/patients/${p.patient_id}`)}>
                <td className="px-4 py-3 font-medium">{p.first_name} {p.last_name}</td>
                <td className="px-4 py-3">{p.cnic}</td>
                <td className="px-4 py-3 capitalize">{p.gender}</td>
                <td className="px-4 py-3">{String(p.date_of_birth).slice(0, 10)}</td>
                <td className="px-4 py-3">{p.blood_group ?? "-"}</td>
                <td className="px-4 py-3">{p.phone ?? "-"}</td>
                <td className="px-4 py-3">{p.is_doctor ? <span className="badge bg-primary/15 text-primary">{tr("doctor")}</span> : <span className="badge bg-success/15 text-success">{tr("patient")}</span>}</td>
              </tr>
            ))}
            {patients.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted">{tr("noPatientsFound")}</td></tr>}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
