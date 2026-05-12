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
  const isDoctor = userRoles.includes("doctor");
  const isPatient = userRoles.includes("patient");
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
  }, [search, isPatient, isDoctor, user?.patient_id, language]);

  async function loadPatients() {
    try {
      if (isDoctor && user?.patient_id) {
        // Fetch visits for this doctor, then get unique patients
        type Visit = { patient_id: string };
        const visits = await api.request<Visit[]>(
          `/visits?doctor_patient_id=${user.patient_id}&limit=1000`
        );
        // Get unique patient IDs (exclude the doctor themselves)
        const uniquePatientIds = [...new Set(
          visits.map((v) => v.patient_id).filter((id) => id !== user.patient_id)
        )];
        if (uniquePatientIds.length === 0) {
          setPatients([]);
          return;
        }
        // Fetch each unique patient
        const patientResults = await Promise.all(
          uniquePatientIds.map((id) =>
            api.request<Patient>(`/patients/${id}`).catch(() => null)
          )
        );
        const validPatients = patientResults.filter((p): p is Patient => p !== null);
        // Apply search filter client-side
        const filtered = search
          ? validPatients.filter((p) =>
              `${p.first_name} ${p.last_name} ${p.cnic}`.toLowerCase().includes(search.toLowerCase())
            )
          : validPatients;
        setPatients(filtered);
      } else {
        const data = await api.request<Patient[]>(
          `/patients?skip=0&limit=100&search=${encodeURIComponent(search)}`
        );
        setPatients(data);
      }
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
      <PageHeader title={isDoctor ? tr("myPatients") : tr("patients")} subtitle={isDoctor ? tr("patientsWhoVisitedYou") ?? "Patients who have visited you" : tr("patientsSubtitle")}
        icon={<Users size={20} />}
        right={
          <div className="flex flex-col md:flex-row items-end md:items-center gap-4">
            {!isPatient && (
              <div className="flex items-center gap-2">
                <input className="input w-64 text-slate-800 placeholder-slate-400" placeholder={tr("searchByNameOrCnic")} value={search} onChange={(e) => setSearch(e.target.value)} />
                {canCreate && <button className="btn-primary whitespace-nowrap" onClick={() => setShowCreate(true)}><Plus size={16} /> {tr("newPatient")}</button>}
              </div>
            )}
          </div>
        }
      />

      {error && <div className="card p-4 text-sm text-danger">{error}</div>}

      {showCreate && (
        <div className="modal-overlay z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ duration: 0.2 }}
            className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-white/70 bg-white/90 shadow-[0_30px_90px_rgba(2,132,199,0.18)] backdrop-blur-2xl"
          >
            {/* Top accent bar */}
            <div className="absolute inset-x-0 top-0 h-1 rounded-t-3xl bg-gradient-to-r from-primary-500 via-cyan-400 to-sky-300" />

            <div className="p-7">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                    <Plus size={18} className="text-primary" />
                  </div>
                  <h2 className="text-xl font-bold text-slate-900">{tr("registerNewPatient")}</h2>
                </div>
                <button
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-700"
                  onClick={() => setShowCreate(false)}
                >
                  <X size={16} />
                </button>
              </div>

              <form className="space-y-5" onSubmit={handleCreate}>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">{tr("firstName")} *</label>
                    <input
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition focus:border-primary/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                      value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} required placeholder="John"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">{tr("lastName")} *</label>
                    <input
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition focus:border-primary/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                      value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} required placeholder="Doe"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">{tr("cnic")} *</label>
                    <input
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition focus:border-primary/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                      value={form.cnic} onChange={(e) => setForm({ ...form, cnic: e.target.value })} required placeholder="12345-1234567-1" pattern="\d{5}-\d{7}-\d{1}" title="Format: XXXXX-XXXXXXX-X"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">{tr("dateOfBirth")} *</label>
                    <input
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition focus:border-primary/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                      type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">{tr("gender")} *</label>
                    <select
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 transition focus:border-primary/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                      value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}
                    >
                      <option value="male">{tr("male")}</option>
                      <option value="female">{tr("female")}</option>
                      <option value="other">{tr("other")}</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">{tr("bloodGroup")} *</label>
                    <select
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 transition focus:border-primary/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                      value={form.blood_group} onChange={(e) => setForm({ ...form, blood_group: e.target.value })}
                    >
                      {BLOOD_GROUPS.map((bg) => <option key={bg} value={bg}>{bg}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">{tr("phone")} *</label>
                    <input
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition focus:border-primary/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                      value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required placeholder="03001234567"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">{tr("email")}</label>
                    <input
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition focus:border-primary/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                      type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="john@example.com"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">{tr("address")}</label>
                    <input
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition focus:border-primary/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                      value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="123 Main Street, Karachi"
                    />
                  </div>
                </div>

                {createError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                    {createError}
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                    onClick={() => setShowCreate(false)}
                  >
                    {tr("cancel")}
                  </button>
                  <button
                    className="btn-primary rounded-xl px-5 py-2.5 text-sm"
                    type="submit"
                    disabled={creating}
                  >
                    {creating ? tr("creating") : tr("createPatient")}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
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
