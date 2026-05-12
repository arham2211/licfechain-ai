"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  UserCircle, Stethoscope, Building2, BadgeCheck, Phone,
  Mail, MapPin, Calendar, CreditCard, Droplets, User,
} from "lucide-react";
import { api } from "@/lib/api-client";
import { getUser } from "@/lib/auth-store";
import { useLanguage } from "@/components/providers/LanguageProvider";

type PatientProfile = {
  patient_id: string;
  first_name: string;
  last_name: string;
  cnic: string;
  date_of_birth: string;
  gender: string;
  blood_group?: string;
  phone?: string;
  email?: string;
  address?: string;
  created_at: string;
  updated_at: string;
};

type DoctorProfile = {
  patient_id: string;
  first_name: string;
  last_name: string;
  specialization?: string;
  license_number?: string;
  hospital_affiliation?: string;
  cnic?: string;
  phone?: string;
};

function computeAge(dob: string): number {
  const birth = new Date(dob);
  const diff = Date.now() - birth.getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: "numeric", month: "long", day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

export default function DoctorMyDetailsPage() {
  const { tr } = useLanguage();
  const user = getUser();
  const patientId = user?.patient_id;

  const [patient, setPatient] = useState<PatientProfile | null>(null);
  const [doctor, setDoctor] = useState<DoctorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!patientId) {
      setError("No patient profile linked to your account.");
      setLoading(false);
      return;
    }
    loadDetails(patientId);
  }, [patientId]);

  async function loadDetails(pid: string) {
    try {
      const [patientData, doctorData] = await Promise.all([
        api.request<PatientProfile>(`/patients/${pid}`).catch(() => null),
        api.request<DoctorProfile>(`/doctors/${pid}`).catch(() => null),
      ]);
      setPatient(patientData);
      setDoctor(doctorData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load profile.");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <UserCircle size={36} className="animate-pulse text-primary" />
          <span className="text-sm text-muted">{tr("loading")}</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <div className="alert-error">{error}</div>
      </div>
    );
  }

  const fullName = patient
    ? `${patient.first_name} ${patient.last_name}`
    : user?.username ?? "Doctor";

  const initials = patient
    ? `${patient.first_name[0] ?? ""}${patient.last_name[0] ?? ""}`.toUpperCase()
    : (user?.username?.[0] ?? "D").toUpperCase();

  return (
    <motion.div
      className="mx-auto w-full max-w-4xl space-y-6 px-1 sm:px-4 xl:px-0 py-2"
      initial="hidden"
      animate="show"
      variants={stagger}
    >
      {/* ── Hero Card ── */}
      <motion.div
        variants={fadeUp}
        className="relative overflow-hidden rounded-4xl border border-white/80 bg-white/72 p-8 shadow-[0_30px_90px_rgba(2,132,199,0.14)] backdrop-blur-2xl md:p-10"
      >
        <div className="absolute inset-x-0 top-0 h-1.5 bg-linear-to-r from-primary-500 via-cyan-400 to-sky-300 opacity-90" />
        <div className="absolute -top-24 right-0 h-72 w-72 rounded-full bg-primary-100/55 blur-[100px]" />
        <div className="absolute -bottom-20 left-0 h-64 w-64 rounded-full bg-cyan-100/60 blur-[100px]" />

        <div className="relative z-10 flex flex-col gap-6 sm:flex-row sm:items-center">
          {/* Avatar */}
          <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-3xl bg-linear-to-br from-primary to-cyan-500 text-3xl font-extrabold text-white shadow-lg shadow-primary/25">
            {initials}
          </div>

          <div className="flex-1">
            <p className="mb-1 flex items-center gap-2 text-xs font-bold tracking-[0.18em] text-primary uppercase">
              <Stethoscope size={14} /> {tr("healthcareProvider")}
            </p>
            <h1 className="text-3xl font-extrabold text-slate-900">{fullName}</h1>
            {doctor?.specialization && (
              <p className="mt-1 text-lg font-medium text-slate-600">{doctor.specialization}</p>
            )}
            {doctor?.hospital_affiliation && (
              <p className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-500">
                <Building2 size={14} /> {doctor.hospital_affiliation}
              </p>
            )}
          </div>

          {/* Quick stat pills */}
          {patient && (
            <div className="flex gap-3 sm:flex-col sm:items-end">
              <div className="flex flex-col items-center rounded-2xl border border-primary/10 bg-primary/5 px-5 py-3 shadow-sm">
                <span className="text-2xl font-extrabold text-slate-900">{computeAge(patient.date_of_birth)}</span>
                <span className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{tr("age")}</span>
              </div>
              <div className="flex flex-col items-center rounded-2xl border border-cyan-500/10 bg-cyan-50 px-5 py-3 shadow-sm">
                <span className="text-2xl font-extrabold text-slate-900">{patient.blood_group ?? "—"}</span>
                <span className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{tr("blood")}</span>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* ── Personal Information ── */}
        {patient && (
          <motion.div
            variants={fadeUp}
            className="card border-white/70 bg-white/78 p-6 shadow-[0_20px_60px_rgba(2,132,199,0.08)] backdrop-blur-xl"
          >
            <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-slate-900">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                <User size={15} className="text-primary" />
              </div>
              {tr("personalInformation")}
            </h2>
            <div className="space-y-3">
              <DetailRow icon={<User size={15} />} label={tr("fullName")} value={fullName} />
              <DetailRow icon={<CreditCard size={15} />} label={tr("cnic")} value={patient.cnic} />
              <DetailRow
                icon={<Calendar size={15} />}
                label={tr("dateOfBirth")}
                value={formatDate(patient.date_of_birth)}
              />
              <DetailRow
                icon={<User size={15} />}
                label={tr("gender")}
                value={<span className="capitalize">{patient.gender}</span>}
              />
              <DetailRow
                icon={<Droplets size={15} />}
                label={tr("bloodGroup")}
                value={patient.blood_group ?? "—"}
              />
            </div>
          </motion.div>
        )}

        {/* ── Doctor (Clinical) Information ── */}
        {doctor && (
          <motion.div
            variants={fadeUp}
            className="card border-white/70 bg-white/78 p-6 shadow-[0_20px_60px_rgba(2,132,199,0.08)] backdrop-blur-xl"
          >
            <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-slate-900">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/10">
                <Stethoscope size={15} className="text-cyan-600" />
              </div>
              {tr("systemInformation")}
            </h2>
            <div className="space-y-3">
              {doctor.specialization && (
                <DetailRow
                  icon={<Stethoscope size={15} />}
                  label={tr("specialization")}
                  value={
                    <span className="badge bg-primary/12 text-primary border border-primary/20">
                      {doctor.specialization}
                    </span>
                  }
                />
              )}
              {doctor.license_number && (
                <DetailRow
                  icon={<BadgeCheck size={15} />}
                  label={tr("license")}
                  value={doctor.license_number}
                />
              )}
              {doctor.hospital_affiliation && (
                <DetailRow
                  icon={<Building2 size={15} />}
                  label={tr("hospital")}
                  value={doctor.hospital_affiliation}
                />
              )}
            </div>
          </motion.div>
        )}

        {/* ── Contact Information ── */}
        {patient && (patient.phone || patient.email || patient.address) && (
          <motion.div
            variants={fadeUp}
            className="card border-white/70 bg-white/78 p-6 shadow-[0_20px_60px_rgba(2,132,199,0.08)] backdrop-blur-xl md:col-span-2"
          >
            <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-slate-900">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/10">
                <Phone size={15} className="text-sky-600" />
              </div>
              Contact Information
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {patient.phone && (
                <DetailRow icon={<Phone size={15} />} label={tr("phone")} value={patient.phone} />
              )}
              {patient.email && (
                <DetailRow icon={<Mail size={15} />} label={tr("email")} value={patient.email} />
              )}
              {patient.address && (
                <DetailRow icon={<MapPin size={15} />} label={tr("address")} value={patient.address} />
              )}
            </div>
          </motion.div>
        )}

        {/* ── Account Information ── */}
        {patient && (
          <motion.div
            variants={fadeUp}
            className="card border-white/70 bg-white/78 p-6 shadow-[0_20px_60px_rgba(2,132,199,0.08)] backdrop-blur-xl md:col-span-2"
          >
            <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-slate-900">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10">
                <BadgeCheck size={15} className="text-emerald-600" />
              </div>
              Account Information
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <DetailRow
                icon={<Calendar size={15} />}
                label={tr("created")}
                value={formatDate(patient.created_at)}
              />
              <DetailRow
                icon={<Calendar size={15} />}
                label={tr("lastUpdated")}
                value={formatDate(patient.updated_at)}
              />
              <DetailRow
                icon={<CreditCard size={15} />}
                label="Patient ID"
                value={
                  <span className="font-mono text-xs text-slate-600 break-all">{patient.patient_id}</span>
                }
              />
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-white/80 bg-white/85 px-4 py-3 shadow-sm">
      <span className="mt-0.5 text-primary/60 shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
        <div className="mt-0.5 text-sm font-medium text-slate-900">{value}</div>
      </div>
    </div>
  );
}
