"use client";

import { useEffect, useState, FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  User, GitBranch, Heart, Plus, X, Trash2,
  ChevronRight, CheckCircle, Search, AlertTriangle,
  Baby, Crown, Dna, Loader2, HeartPulse, Edit2,
} from "lucide-react";
import { api } from "@/lib/api-client";
import { getUser } from "@/lib/auth-store";
import { useLanguage } from "@/components/providers/LanguageProvider";

/* ─────────── Types ─────────── */

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
  specialization?: string;
  license_number?: string;
  hospital_affiliation?: string;
  created_at: string;
  updated_at: string;
};

type FamilyRelationship = {
  id: string;
  patient_id: string;
  relative_patient_id: string;
  relationship_type: string;
  is_blood_relative: boolean;
  created_at: string;
};

type FamilyDiseaseEntry = {
  relative_patient_id: string;
  relative_name: string;
  relationship_type: string;
  disease_names: string[];
};

type FamilyDiseaseResponse = {
  family_disease_history: FamilyDiseaseEntry[];
};

type FamilyMember = FamilyRelationship & {
  relative?: Patient;
  diseases: string[];
};

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

const RELATIONSHIP_OPTIONS = [
  { value: "grandparent", label: "Grandparent", icon: Crown, color: "bg-purple-50 border-purple-200 text-purple-700", bloodDefault: true },
  { value: "parent", label: "Parent", icon: User, color: "bg-blue-50 border-blue-200 text-blue-700", bloodDefault: true },
  { value: "sibling", label: "Sibling", icon: Heart, color: "bg-cyan-50 border-cyan-200 text-cyan-700", bloodDefault: true },
  { value: "spouse", label: "Spouse", icon: HeartPulse, color: "bg-rose-50 border-rose-200 text-rose-700", bloodDefault: false },
  { value: "child", label: "Child", icon: Baby, color: "bg-green-50 border-green-200 text-green-700", bloodDefault: true },
  { value: "grandchild", label: "Grandchild", icon: Baby, color: "bg-emerald-50 border-emerald-200 text-emerald-700", bloodDefault: true },
  { value: "aunt_uncle", label: "Aunt / Uncle", icon: User, color: "bg-amber-50 border-amber-200 text-amber-700", bloodDefault: true },
  { value: "niece_nephew", label: "Niece / Nephew", icon: User, color: "bg-orange-50 border-orange-200 text-orange-700", bloodDefault: true },
  { value: "cousin", label: "Cousin", icon: Dna, color: "bg-indigo-50 border-indigo-200 text-indigo-700", bloodDefault: true },
] as const;

const GENERATION_ORDER: Record<string, number> = {
  grandparent: 0, parent: 1, aunt_uncle: 2,
  sibling: 3, spouse: 3, cousin: 3,
  child: 4, niece_nephew: 4,
  grandchild: 5,
};

function groupByRelationship(members: FamilyMember[]) {
  const groups: Record<string, FamilyMember[]> = {};
  for (const m of members) {
    if (!groups[m.relationship_type]) groups[m.relationship_type] = [];
    groups[m.relationship_type].push(m);
  }
  return Object.entries(groups).sort(
    ([a], [b]) => (GENERATION_ORDER[a] ?? 99) - (GENERATION_ORDER[b] ?? 99)
  );
}

function getRelMeta(type: string) {
  return RELATIONSHIP_OPTIONS.find((r) => r.value === type);
}

function computeAge(dob: string) {
  const diff = Date.now() - new Date(dob).getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}

/* ─────────── Component ─────────── */

export default function PatientDetailPage() {
  const { language } = useLanguage();
  const params = useParams();
  const router = useRouter();
  const patientId = params.id as string;
  const user = getUser();
  const userRoles = user?.roles ?? [];
  const canEdit = userRoles.includes("admin");
  const isOwnPatientPortalView = userRoles.includes("patient") && user?.patient_id === patientId;

  /* Patient state */
  const [patient, setPatient] = useState<Patient | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Patient>>({});
  const [editError, setEditError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  /* Family state */
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [familyLoading, setFamilyLoading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  /* Wizard state */
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Patient[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedRelative, setSelectedRelative] = useState<Patient | null>(null);
  const [relationshipType, setRelationshipType] = useState("parent");
  const [isBloodRelative, setIsBloodRelative] = useState(true);
  const [selectedDiseases, setSelectedDiseases] = useState<string[]>([]);
  const [customDisease, setCustomDisease] = useState("");
  const [addingFamily, setAddingFamily] = useState(false);
  const [wizardError, setWizardError] = useState<string | null>(null);

  useEffect(() => {
    loadPatient();
    if (!isOwnPatientPortalView) {
      loadFamily();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId, language, isOwnPatientPortalView]);

  /* Search debounce */
  useEffect(() => {
    if (searchQuery.length < 2) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const data = await api.request<Patient[]>(`/patients?search=${encodeURIComponent(searchQuery)}&limit=8`);
        setSearchResults(data.filter((p) => p.patient_id !== patientId));
      } catch { setSearchResults([]); }
      finally { setSearchLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, patientId]);

  async function loadPatient() {
    try {
      const data = await api.request<Patient>(`/patients/${patientId}`);
      setPatient(data);
    } catch (e) {
      setPageError(e instanceof Error ? e.message : "Failed to load patient");
    }
  }

  async function loadFamily() {
    setFamilyLoading(true);
    try {
      const [rels, diseaseResp] = await Promise.all([
        api.request<FamilyRelationship[]>(`/patients/${patientId}/family-relationships`).catch(() => [] as FamilyRelationship[]),
        api.request<FamilyDiseaseResponse>(`/patients/${patientId}/family-disease-history`).catch(() => null),
      ]);

      const diseaseMap = new Map<string, string[]>();
      for (const entry of diseaseResp?.family_disease_history ?? []) {
        diseaseMap.set(entry.relative_patient_id, entry.disease_names ?? []);
      }

      const members: FamilyMember[] = await Promise.all(
        rels.map(async (rel) => {
          const relPatient = await api.request<Patient>(`/patients/${rel.relative_patient_id}`).catch(() => undefined);
          return { ...rel, relative: relPatient, diseases: diseaseMap.get(rel.relative_patient_id) ?? [] };
        })
      );

      setFamilyMembers(members);
    } catch {
      setFamilyMembers([]);
    } finally {
      setFamilyLoading(false);
    }
  }

  /* ── Edit patient ── */
  function startEdit() {
    if (!patient) return;
    setEditForm({
      first_name: patient.first_name, last_name: patient.last_name,
      cnic: patient.cnic, date_of_birth: String(patient.date_of_birth).slice(0, 10),
      gender: patient.gender, blood_group: patient.blood_group,
      phone: patient.phone, email: patient.email, address: patient.address,
    });
    setEditing(true); setEditError(null);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault(); setEditError(null); setSaving(true);
    try {
      await api.request<Patient>(`/patients/${patientId}`, { method: "PUT", body: JSON.stringify(editForm) });
      setEditing(false);
      setSuccessMsg("Patient updated successfully!");
      setTimeout(() => setSuccessMsg(null), 3000);
      await loadPatient();
    } catch (e) { setEditError(e instanceof Error ? e.message : "Failed to update"); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!confirm("Are you sure you want to delete this patient? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await api.request(`/patients/${patientId}`, { method: "DELETE" });
      router.push("/patients");
    } catch (e) { setPageError(e instanceof Error ? e.message : "Failed to delete"); setDeleting(false); }
  }

  /* ── Wizard ── */
  function openWizard() {
    setWizardOpen(true); setWizardStep(1);
    setSearchQuery(""); setSearchResults([]);
    setSelectedRelative(null); setRelationshipType("parent");
    setIsBloodRelative(true); setSelectedDiseases([]); setCustomDisease(""); setWizardError(null);
  }

  function closeWizard() { setWizardOpen(false); setWizardError(null); }

  function selectRelative(p: Patient) {
    setSelectedRelative(p); setSearchQuery(`${p.first_name} ${p.last_name}`); setSearchResults([]);
  }

  function goToStep2() {
    if (!selectedRelative) { setWizardError("Please select a patient first."); return; }
    setWizardError(null); setWizardStep(2);
  }

  function onRelTypeSelect(value: string) {
    setRelationshipType(value);
    const meta = getRelMeta(value);
    setIsBloodRelative(meta?.bloodDefault ?? true);
  }

  function toggleDisease(d: string) {
    setSelectedDiseases((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
    );
  }

  function addCustomDisease() {
    const trimmed = customDisease.trim().toLowerCase().replace(/\s+/g, "_");
    if (!trimmed || selectedDiseases.includes(trimmed)) { setCustomDisease(""); return; }
    setSelectedDiseases((prev) => [...prev, trimmed]);
    setCustomDisease("");
  }

  async function handleConfirmAdd() {
    if (!selectedRelative) return;
    setAddingFamily(true); setWizardError(null);
    try {
      await api.request(`/patients/${patientId}/family-relationships`, {
        method: "POST",
        body: JSON.stringify({
          relative_patient_id: selectedRelative.patient_id,
          relationship_type: relationshipType,
          is_blood_relative: isBloodRelative,
        }),
      });
      // Record any manually tagged diseases on the relative's record
      await Promise.allSettled(
        selectedDiseases.map((disease) =>
          api.request(`/patients/${selectedRelative.patient_id}/known-diseases`, {
            method: "POST",
            body: JSON.stringify({ disease_name: disease }),
          })
        )
      );
      closeWizard();
      const diseaseNote = selectedDiseases.length > 0 ? ` with ${selectedDiseases.length} condition${selectedDiseases.length > 1 ? "s" : ""} tagged` : "";
      setSuccessMsg(`${selectedRelative.first_name} ${selectedRelative.last_name} added to the family tree${diseaseNote}!`);
      setTimeout(() => setSuccessMsg(null), 4000);
      await loadFamily();
    } catch (e) {
      setWizardError(e instanceof Error ? e.message : "Failed to add family member.");
    } finally { setAddingFamily(false); }
  }

  async function handleRemoveMember(relationshipId: string, name: string) {
    if (!confirm(`Remove ${name} from the family tree?`)) return;
    setRemovingId(relationshipId);
    try {
      await api.request(`/patients/${patientId}/family-relationships/${relationshipId}`, { method: "DELETE" });
      setFamilyMembers((prev) => prev.filter((m) => m.id !== relationshipId));
      setSuccessMsg(`${name} removed from family tree.`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (e) { setPageError(e instanceof Error ? e.message : "Failed to remove"); }
    finally { setRemovingId(null); }
  }

  const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
  const fadeUp = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.35 } } };

  if (pageError && !patient) {
    return (
      <div className="space-y-4 p-4">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{pageError}</div>
        <button className="btn-primary" onClick={() => router.push("/patients")}>← Back to Patients</button>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="flex items-center justify-center h-48 gap-3 text-muted">
        <Loader2 className="animate-spin" size={22} />
        <span className="text-sm">Loading patient…</span>
      </div>
    );
  }

  const groupedFamily = groupByRelationship(familyMembers);
  const relMeta = getRelMeta(relationshipType);

  return (
    <motion.div className="mx-auto w-full max-w-5xl space-y-6 px-1 sm:px-4 xl:px-0 py-2"
      initial="hidden" animate="show" variants={stagger}>

      {/* ── Header card ── */}
      <motion.div variants={fadeUp}
        className="relative overflow-hidden rounded-3xl border border-white/80 bg-white/80 p-6 shadow-[0_20px_60px_rgba(2,132,199,0.12)] backdrop-blur-2xl">
        <div className="absolute inset-x-0 top-0 h-1 rounded-t-3xl bg-gradient-to-r from-primary-500 via-cyan-400 to-sky-300" />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <User size={26} className="text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-slate-900">{patient.first_name} {patient.last_name}</h1>
              <p className="text-sm text-slate-500 font-medium">{patient.cnic}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => router.push("/patients")}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
              ← Back
            </button>
            {canEdit && !editing && (
              <button onClick={startEdit}
                className="flex items-center gap-1.5 rounded-xl bg-primary/10 border border-primary/20 px-4 py-2 text-sm font-semibold text-primary transition hover:bg-primary/20">
                <Edit2 size={14} /> Edit
              </button>
            )}
            {canEdit && (
              <button onClick={handleDelete} disabled={deleting}
                className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-100 disabled:opacity-50">
                <Trash2 size={14} /> {deleting ? "Deleting…" : "Delete"}
              </button>
            )}
          </div>
        </div>
      </motion.div>

      {/* ── Banners ── */}
      <AnimatePresence>
        {successMsg && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
            <CheckCircle size={16} /> {successMsg}
          </motion.div>
        )}
        {pageError && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            <AlertTriangle size={16} /> {pageError}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Patient info card ── */}
      <motion.div variants={fadeUp}
        className="rounded-3xl border border-white/70 bg-white/78 p-6 shadow-[0_20px_60px_rgba(2,132,199,0.08)] backdrop-blur-xl">
        {editing ? (
          <>
            <h2 className="mb-5 flex items-center gap-2 text-lg font-bold text-slate-900">
              <Edit2 size={18} className="text-primary" /> Edit Patient Information
            </h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {[
                  { label: "First Name", key: "first_name", placeholder: "John" },
                  { label: "Last Name", key: "last_name", placeholder: "Doe" },
                  { label: "CNIC", key: "cnic", placeholder: "12345-1234567-1" },
                ].map(({ label, key, placeholder }) => (
                  <div key={key}>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</label>
                    <input className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-primary/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                      value={(editForm as Record<string, string>)[key] ?? ""} placeholder={placeholder}
                      onChange={(e) => setEditForm({ ...editForm, [key]: e.target.value })} />
                  </div>
                ))}
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Date of Birth</label>
                  <input type="date" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 focus:border-primary/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                    value={editForm.date_of_birth ? String(editForm.date_of_birth).slice(0, 10) : ""}
                    onChange={(e) => setEditForm({ ...editForm, date_of_birth: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Gender</label>
                  <select className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 focus:border-primary/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                    value={editForm.gender ?? "male"} onChange={(e) => setEditForm({ ...editForm, gender: e.target.value })}>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Blood Group</label>
                  <select className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 focus:border-primary/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                    value={editForm.blood_group ?? "O+"} onChange={(e) => setEditForm({ ...editForm, blood_group: e.target.value })}>
                    {BLOOD_GROUPS.map((bg) => <option key={bg} value={bg}>{bg}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Phone</label>
                  <input className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-primary/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                    value={editForm.phone ?? ""} placeholder="03001234567"
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Email</label>
                  <input type="email" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-primary/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                    value={editForm.email ?? ""} placeholder="john@example.com"
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Address</label>
                  <input className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-primary/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                    value={editForm.address ?? ""} placeholder="123 Main Street, Karachi"
                    onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} />
                </div>
              </div>
              {editError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{editError}</div>
              )}
              <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={() => setEditing(false)}
                  className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="btn-primary rounded-xl px-5 py-2.5 text-sm">
                  {saving ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            <h2 className="mb-5 flex items-center gap-2 text-lg font-bold text-slate-900">
              <User size={18} className="text-primary" /> Personal Information
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { label: "Full Name", value: `${patient.first_name} ${patient.last_name}` },
                { label: "CNIC", value: patient.cnic },
                { label: "Date of Birth", value: String(patient.date_of_birth).slice(0, 10) },
                { label: "Age", value: `${computeAge(patient.date_of_birth)} years` },
                { label: "Gender", value: patient.gender },
                { label: "Blood Group", value: patient.blood_group ?? "—" },
                { label: "Phone", value: patient.phone ?? "—" },
                { label: "Email", value: patient.email ?? "—" },
                { label: "Address", value: patient.address ?? "—" },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-xl border border-white/80 bg-white/85 px-4 py-3 shadow-sm">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
                  <div className="mt-0.5 text-sm font-semibold text-slate-800 break-words">{value}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </motion.div>

      {/* ── Family Tree Section ── */}
      {!isOwnPatientPortalView && (
        <motion.div variants={fadeUp}
          className="rounded-3xl border border-white/70 bg-white/78 p-6 shadow-[0_20px_60px_rgba(2,132,199,0.08)] backdrop-blur-xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
              <GitBranch size={18} className="text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Family Tree</h2>
              <p className="text-xs text-slate-400">
                {familyMembers.length} member{familyMembers.length !== 1 ? "s" : ""} linked
                {familyMembers.filter((m) => m.diseases.length > 0).length > 0 &&
                  ` · ${familyMembers.filter((m) => m.diseases.length > 0).length} with conditions`}
              </p>
            </div>
          </div>
          {canEdit && (
            <button onClick={openWizard}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow-md shadow-primary/25 transition hover:bg-primary/90">
              <Plus size={15} /> Add Member
            </button>
          )}
        </div>

        {familyLoading ? (
          <div className="flex items-center justify-center py-12 gap-3 text-muted">
            <Loader2 className="animate-spin" size={20} />
            <span className="text-sm">Loading family tree…</span>
          </div>
        ) : familyMembers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
              <GitBranch size={28} className="text-slate-400" />
            </div>
            <p className="text-sm font-semibold text-slate-500">No family members added yet</p>
            <p className="text-xs text-slate-400 max-w-xs">
              Click "Add Member" to start building this patient's family tree. Family history is critical for hereditary disease risk assessment.
            </p>
            {canEdit && (
              <button onClick={openWizard}
                className="mt-2 flex items-center gap-1.5 rounded-xl bg-primary/10 border border-primary/20 px-4 py-2 text-sm font-semibold text-primary transition hover:bg-primary/20">
                <Plus size={14} /> Add First Member
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {groupedFamily.map(([relType, members]) => {
              const meta = getRelMeta(relType);
              const Icon = meta?.icon ?? User;
              return (
                <div key={relType}>
                  <div className="mb-3 flex items-center gap-2">
                    <Icon size={14} className="text-slate-400" />
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      {meta?.label ?? relType.replace(/_/g, " ")}s ({members.length})
                    </span>
                    <div className="flex-1 h-px bg-slate-100" />
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {members.map((m) => {
                      const name = m.relative ? `${m.relative.first_name} ${m.relative.last_name}` : "Unknown";
                      const hasDisease = m.diseases.length > 0;
                      return (
                        <div key={m.id}
                          className={`relative rounded-2xl border p-4 transition-all hover:shadow-md ${
                            hasDisease ? "border-orange-200 bg-orange-50/60" : "border-white/80 bg-white/85"
                          }`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-sm font-bold ${meta?.color ?? "bg-slate-100 border-slate-200 text-slate-600"}`}>
                                {name.charAt(0)}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-slate-900 truncate">{name}</p>
                                {m.relative && <p className="text-xs text-slate-400">{m.relative.cnic}</p>}
                              </div>
                            </div>
                            {canEdit && (
                              <button
                                onClick={() => handleRemoveMember(m.id, name)}
                                disabled={removingId === m.id}
                                className="shrink-0 flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-500 disabled:opacity-40">
                                {removingId === m.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                              </button>
                            )}
                          </div>
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {m.is_blood_relative && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                                <Dna size={9} /> Blood
                              </span>
                            )}
                            {m.relative && (
                              <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 capitalize">
                                {m.relative.gender}
                              </span>
                            )}
                            {m.relative?.blood_group && (
                              <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                                {m.relative.blood_group}
                              </span>
                            )}
                          </div>
                          {hasDisease && (
                            <div className="mt-3 space-y-1">
                              <p className="text-[10px] font-bold uppercase tracking-wide text-orange-600 flex items-center gap-1">
                                <AlertTriangle size={9} /> Conditions
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {m.diseases.map((d) => (
                                  <span key={d} className="rounded-full bg-orange-100 border border-orange-200 px-2 py-0.5 text-[10px] font-semibold text-orange-700 capitalize">
                                    {d.replace(/_/g, " ")}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Hereditary risk summary */}
            {familyMembers.some((m) => m.diseases.length > 0) && (
              <div className="rounded-2xl border border-orange-200 bg-orange-50/60 p-4">
                <p className="mb-2 flex items-center gap-2 text-sm font-bold text-orange-700">
                  <HeartPulse size={16} /> Hereditary Risk Summary
                </p>
                <div className="flex flex-wrap gap-2">
                  {Array.from(new Set(familyMembers.flatMap((m) => m.diseases))).map((disease) => {
                    const count = familyMembers.filter((m) => m.diseases.includes(disease)).length;
                    return (
                      <span key={disease} className="rounded-full border border-orange-200 bg-white px-3 py-1 text-xs font-semibold text-orange-700 capitalize">
                        {disease.replace(/_/g, " ")} · {count} relative{count !== 1 ? "s" : ""}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
        </motion.div>
      )}

      {/* ═══════ ADD MEMBER WIZARD ═══════ */}
      <AnimatePresence>
        {wizardOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)" }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={(e) => { if (e.target === e.currentTarget) closeWizard(); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 20 }}
              transition={{ duration: 0.22 }}
              className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-white/70 bg-white/95 shadow-[0_40px_120px_rgba(2,132,199,0.22)] backdrop-blur-2xl"
            >
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary-500 via-cyan-400 to-sky-300" />

              <div className="px-7 pt-7 pb-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-primary mb-0.5">Step {wizardStep} of 4</p>
                    <h2 className="text-xl font-extrabold text-slate-900">
                      {wizardStep === 1 && "Search for Family Member"}
                      {wizardStep === 2 && "Set Relationship"}
                      {wizardStep === 3 && "Known Conditions"}
                      {wizardStep === 4 && "Confirm & Add"}
                    </h2>
                  </div>
                  <button onClick={closeWizard}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-slate-200 transition">
                    <X size={15} />
                  </button>
                </div>

                {/* Progress */}
                <div className="flex gap-1.5 mb-6">
                  {[1, 2, 3, 4].map((s) => (
                    <div key={s} className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${s <= wizardStep ? "bg-primary" : "bg-slate-200"}`} />
                  ))}
                </div>

                {/* ── Step 1: Search ── */}
                {wizardStep === 1 && (
                  <div className="space-y-4">
                    <p className="text-sm text-slate-500">
                      Search for an existing patient to link as a family member of{" "}
                      <strong className="text-slate-800">{patient.first_name} {patient.last_name}</strong>.
                    </p>
                    <div className="relative">
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-10 py-3 text-sm text-slate-900 placeholder-slate-400 focus:border-primary/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                        placeholder="Search by name or CNIC…"
                        value={searchQuery}
                        onChange={(e) => { setSearchQuery(e.target.value); if (selectedRelative) setSelectedRelative(null); }}
                        autoFocus
                      />
                      {searchLoading && <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-primary" size={16} />}
                    </div>

                    {searchResults.length > 0 && (
                      <div className="max-h-52 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg divide-y divide-slate-100">
                        {searchResults.map((p) => (
                          <button key={p.patient_id} type="button"
                            className={`w-full flex items-center gap-3 px-4 py-3 text-left transition hover:bg-primary/5 ${selectedRelative?.patient_id === p.patient_id ? "bg-primary/5" : ""}`}
                            onClick={() => selectRelative(p)}>
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary">
                              {p.first_name.charAt(0)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-slate-900">{p.first_name} {p.last_name}</p>
                              <p className="text-xs text-slate-400">{p.cnic}</p>
                            </div>
                            {selectedRelative?.patient_id === p.patient_id && <CheckCircle size={16} className="text-primary shrink-0" />}
                          </button>
                        ))}
                      </div>
                    )}

                    {selectedRelative && (
                      <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
                        <p className="text-xs font-bold uppercase tracking-wide text-primary mb-2 flex items-center gap-1.5">
                          <CheckCircle size={12} /> Selected
                        </p>
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 font-bold text-primary">
                            {selectedRelative.first_name.charAt(0)}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900">{selectedRelative.first_name} {selectedRelative.last_name}</p>
                            <p className="text-xs text-slate-400">{selectedRelative.cnic}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {wizardError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{wizardError}</div>}
                    <div className="flex justify-end gap-3 pt-1">
                      <button type="button" onClick={closeWizard}
                        className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
                      <button type="button" onClick={goToStep2} disabled={!selectedRelative}
                        className="flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-primary/25 transition hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed">
                        Next <ChevronRight size={15} />
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Step 2: Relationship ── */}
                {wizardStep === 2 && (
                  <div className="space-y-4">
                    <p className="text-sm text-slate-500">
                      How is <strong className="text-slate-800">{selectedRelative?.first_name}</strong> related to{" "}
                      <strong className="text-slate-800">{patient.first_name}</strong>?
                    </p>

                    <div className="grid grid-cols-3 gap-2">
                      {RELATIONSHIP_OPTIONS.map(({ value, label, icon: Icon, color }) => (
                        <button key={value} type="button" onClick={() => onRelTypeSelect(value)}
                          className={`flex flex-col items-center gap-2 rounded-2xl border-2 p-3 text-center transition-all hover:shadow-md ${
                            relationshipType === value ? "border-primary bg-primary/5 shadow-md" : "border-slate-200 bg-white hover:border-slate-300"
                          }`}>
                          <div className={`flex h-9 w-9 items-center justify-center rounded-xl border ${color}`}>
                            <Icon size={16} />
                          </div>
                          <span className={`text-[11px] font-bold leading-tight ${relationshipType === value ? "text-primary" : "text-slate-600"}`}>
                            {label}
                          </span>
                        </button>
                      ))}
                    </div>

                    <div className={`rounded-2xl border p-4 transition cursor-pointer ${isBloodRelative ? "border-primary/25 bg-primary/5" : "border-slate-200 bg-slate-50"}`}
                      onClick={() => setIsBloodRelative(!isBloodRelative)}>
                      <div className="flex items-center gap-3">
                        <div className={`relative h-6 w-11 rounded-full transition-colors ${isBloodRelative ? "bg-primary" : "bg-slate-300"}`}>
                          <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${isBloodRelative ? "translate-x-5" : "translate-x-0.5"}`} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900">Blood Relative</p>
                          <p className="text-xs text-slate-400">Enables hereditary disease risk calculations</p>
                        </div>
                      </div>
                    </div>

                    {wizardError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{wizardError}</div>}
                    <div className="flex justify-between gap-3 pt-1">
                      <button type="button" onClick={() => setWizardStep(1)}
                        className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">← Back</button>
                      <button type="button" onClick={() => { setWizardError(null); setWizardStep(3); }}
                        className="flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-primary/25 transition hover:bg-primary/90">
                        Next <ChevronRight size={15} />
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Step 3: Known Conditions ── */}
                {wizardStep === 3 && (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">
                      <p className="text-sm font-semibold text-sky-800">
                        Does <strong>{selectedRelative?.first_name} {selectedRelative?.last_name}</strong> have any known conditions?
                      </p>
                      <p className="mt-0.5 text-xs text-sky-600">
                        These will be recorded on their profile and factored into hereditary risk for connected patients. This step is optional — skip if unsure.
                      </p>
                    </div>

                    {/* Preset disease chips */}
                    <div>
                      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Common Conditions</p>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { value: "diabetes", label: "Diabetes" },
                          { value: "anemia", label: "Anemia" },
                          { value: "ckd", label: "CKD" },
                          { value: "parathyroid", label: "Parathyroid" },
                          { value: "oral_cancer", label: "Oral Cancer" },
                        ].map(({ value, label }) => {
                          const active = selectedDiseases.includes(value);
                          return (
                            <button key={value} type="button" onClick={() => toggleDisease(value)}
                              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
                                active
                                  ? "border-orange-300 bg-orange-100 text-orange-700 shadow-sm"
                                  : "border-slate-200 bg-white text-slate-600 hover:border-orange-200 hover:bg-orange-50"
                              }`}>
                              {active && <CheckCircle size={11} />}
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Custom disease input */}
                    <div>
                      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Add Other Condition</p>
                      <div className="flex gap-2">
                        <input
                          className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-primary/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                          placeholder="e.g. Thalassemia, Obesity…"
                          value={customDisease}
                          onChange={(e) => setCustomDisease(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomDisease(); } }}
                        />
                        <button type="button" onClick={addCustomDisease}
                          disabled={!customDisease.trim()}
                          className="flex items-center gap-1.5 rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-200 disabled:opacity-40">
                          <Plus size={14} /> Add
                        </button>
                      </div>
                    </div>

                    {/* Selected diseases summary */}
                    {selectedDiseases.length > 0 && (
                      <div className="rounded-xl border border-orange-200 bg-orange-50/60 p-3">
                        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-orange-600 flex items-center gap-1.5">
                          <AlertTriangle size={10} /> {selectedDiseases.length} condition{selectedDiseases.length > 1 ? "s" : ""} selected
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedDiseases.map((d) => (
                            <span key={d} className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-white px-2.5 py-1 text-xs font-semibold text-orange-700">
                              {d.replace(/_/g, " ")}
                              <button type="button" onClick={() => toggleDisease(d)} className="ml-0.5 text-orange-400 hover:text-orange-600"><X size={10} /></button>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex justify-between gap-3 pt-1">
                      <button type="button" onClick={() => setWizardStep(2)}
                        className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">← Back</button>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => { setSelectedDiseases([]); setWizardStep(4); }}
                          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-50">
                          Skip
                        </button>
                        <button type="button" onClick={() => { setWizardError(null); setWizardStep(4); }}
                          className="flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-primary/25 transition hover:bg-primary/90">
                          Next <ChevronRight size={15} />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Step 4: Confirm ── */}
                {wizardStep === 4 && (
                  <div className="space-y-4">
                    <p className="text-sm text-slate-500">Review before confirming.</p>

                    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5 space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 font-bold text-primary">
                          {patient.first_name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Patient</p>
                          <p className="font-bold text-slate-900">{patient.first_name} {patient.last_name}</p>
                          <p className="text-xs text-slate-400">{patient.cnic}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 pl-5">
                        <div className="h-8 w-px bg-slate-200" />
                        <div className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 ${relMeta?.color ?? "border-slate-200 text-slate-600"}`}>
                          {relMeta && <relMeta.icon size={13} />}
                          <span className="text-xs font-bold capitalize">{relMeta?.label ?? relationshipType.replace(/_/g, " ")}</span>
                          {isBloodRelative && <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold text-primary">BLOOD</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-100 font-bold text-cyan-700">
                          {selectedRelative?.first_name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Family Member</p>
                          <p className="font-bold text-slate-900">{selectedRelative?.first_name} {selectedRelative?.last_name}</p>
                          <p className="text-xs text-slate-400">{selectedRelative?.cnic}</p>
                        </div>
                      </div>
                      {selectedDiseases.length > 0 && (
                        <div className="border-t border-slate-100 pt-3">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-orange-600 mb-1.5 flex items-center gap-1"><AlertTriangle size={9} /> Tagging conditions</p>
                          <div className="flex flex-wrap gap-1">
                            {selectedDiseases.map((d) => (
                              <span key={d} className="rounded-full bg-orange-100 border border-orange-200 px-2 py-0.5 text-[10px] font-semibold text-orange-700 capitalize">
                                {d.replace(/_/g, " ")}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-700">
                      ⚠ Blood relative connections are used in AI-powered hereditary disease risk calculations for both patients.
                    </div>

                    {wizardError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{wizardError}</div>}
                    <div className="flex justify-between gap-3 pt-1">
                      <button type="button" onClick={() => setWizardStep(3)}
                        className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">← Back</button>
                      <button type="button" onClick={handleConfirmAdd} disabled={addingFamily}
                        className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-primary/25 transition hover:bg-primary/90 disabled:opacity-60">
                        {addingFamily ? <><Loader2 size={14} className="animate-spin" /> Adding…</> : <><CheckCircle size={14} /> Confirm & Add</>}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

