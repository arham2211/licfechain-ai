"use client";

import { useEffect, useState, FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
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
    vital_signs?: Record<string, unknown>;
};

type Symptom = { id: string; symptom_name: string; severity?: number; duration_days?: number; notes?: string };
type Diagnosis = { diagnosis_id: string; disease_name: string; diagnosis_date: string; confidence_score?: number; ml_model_used?: string; status: string; notes?: string };
type Prescription = { prescription_id: string; medication_name: string; dosage: string; frequency: string; duration_days?: number; instructions?: string };

export default function VisitDetailPage() {
    const params = useParams();
    const router = useRouter();
    const visitId = params.id as string;
    const user = getUser();
    const userRoles = user?.roles ?? [];
    const canEdit = userRoles.some((r) => ["admin", "doctor"].includes(r));

    const [visit, setVisit] = useState<Visit | null>(null);
    const [symptoms, setSymptoms] = useState<Symptom[]>([]);
    const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([]);
    const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    // Add forms
    const [showSymptom, setShowSymptom] = useState(false);
    const [showDiagnosis, setShowDiagnosis] = useState(false);
    const [showPrescription, setShowPrescription] = useState(false);

    const [symptomForm, setSymptomForm] = useState({ symptom_name: "", severity: "", duration_days: "", notes: "" });
    const [diagnosisForm, setDiagnosisForm] = useState({ disease_name: "", diagnosis_date: new Date().toISOString().slice(0, 16), confidence_score: "", status: "suspected", notes: "", ml_model_used: "" });
    const [prescriptionForm, setPrescriptionForm] = useState({ medication_name: "", dosage: "", frequency: "", duration_days: "", instructions: "" });
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    useEffect(() => {
        loadAll();
    }, [visitId]);

    async function loadAll() {
        try {
            const [v, s, d, p] = await Promise.all([
                api.request<Visit>(`/visits/${visitId}`),
                api.request<Symptom[]>(`/visits/${visitId}/symptoms`).catch(() => []),
                api.request<Diagnosis[]>(`/visits/${visitId}/diagnoses`).catch(() => []),
                api.request<Prescription[]>(`/visits/${visitId}/prescriptions`).catch(() => []),
            ]);
            setVisit(v);
            setSymptoms(s);
            setDiagnoses(d);
            setPrescriptions(p);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load visit");
        }
    }

    async function addSymptom(e: FormEvent) {
        e.preventDefault();
        setFormError(null);
        setSubmitting(true);
        try {
            await api.request(`/visits/${visitId}/symptoms`, {
                method: "POST",
                body: JSON.stringify({
                    symptom_name: symptomForm.symptom_name,
                    severity: symptomForm.severity ? parseInt(symptomForm.severity) : null,
                    duration_days: symptomForm.duration_days ? parseInt(symptomForm.duration_days) : null,
                    notes: symptomForm.notes || null,
                }),
            });
            setShowSymptom(false);
            setSymptomForm({ symptom_name: "", severity: "", duration_days: "", notes: "" });
            setSuccessMsg("Symptom added");
            setTimeout(() => setSuccessMsg(null), 3000);
            await loadAll();
        } catch (e) {
            setFormError(e instanceof Error ? e.message : "Failed to add symptom");
        } finally {
            setSubmitting(false);
        }
    }

    async function addDiagnosis(e: FormEvent) {
        e.preventDefault();
        setFormError(null);
        setSubmitting(true);
        try {
            await api.request(`/visits/${visitId}/diagnoses`, {
                method: "POST",
                body: JSON.stringify({
                    disease_name: diagnosisForm.disease_name,
                    diagnosis_date: new Date(diagnosisForm.diagnosis_date).toISOString(),
                    confidence_score: diagnosisForm.confidence_score ? parseFloat(diagnosisForm.confidence_score) : null,
                    status: diagnosisForm.status,
                    notes: diagnosisForm.notes || null,
                    ml_model_used: diagnosisForm.ml_model_used || null,
                }),
            });
            setShowDiagnosis(false);
            setDiagnosisForm({ disease_name: "", diagnosis_date: new Date().toISOString().slice(0, 16), confidence_score: "", status: "suspected", notes: "", ml_model_used: "" });
            setSuccessMsg("Diagnosis added");
            setTimeout(() => setSuccessMsg(null), 3000);
            await loadAll();
        } catch (e) {
            setFormError(e instanceof Error ? e.message : "Failed to add diagnosis");
        } finally {
            setSubmitting(false);
        }
    }

    async function addPrescription(e: FormEvent) {
        e.preventDefault();
        setFormError(null);
        setSubmitting(true);
        try {
            await api.request(`/visits/${visitId}/prescriptions`, {
                method: "POST",
                body: JSON.stringify({
                    medication_name: prescriptionForm.medication_name,
                    dosage: prescriptionForm.dosage,
                    frequency: prescriptionForm.frequency,
                    duration_days: prescriptionForm.duration_days ? parseInt(prescriptionForm.duration_days) : null,
                    instructions: prescriptionForm.instructions || null,
                }),
            });
            setShowPrescription(false);
            setPrescriptionForm({ medication_name: "", dosage: "", frequency: "", duration_days: "", instructions: "" });
            setSuccessMsg("Prescription added");
            setTimeout(() => setSuccessMsg(null), 3000);
            await loadAll();
        } catch (e) {
            setFormError(e instanceof Error ? e.message : "Failed to add prescription");
        } finally {
            setSubmitting(false);
        }
    }

    async function handleDeleteVisit() {
        if (!confirm("Delete this visit and all related records?")) return;
        try {
            await api.request(`/visits/${visitId}`, { method: "DELETE" });
            router.push("/visits");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to delete visit");
        }
    }

    if (!visit && !error) return <div className="card p-4 text-muted">Loading visit...</div>;
    if (error) return <div className="space-y-4"><PageHeader title="Visit Not Found" /><div className="card p-4 text-sm text-danger">{error}</div><button className="btn-primary" onClick={() => router.push("/visits")}>← Back</button></div>;

    return (
        <div className="space-y-4">
            <PageHeader
                title={`Visit — ${visit!.visit_type.replace(/_/g, " ")}`}
                subtitle={`${String(visit!.visit_date).slice(0, 16).replace("T", " ")}`}
                right={
                    <div className="flex items-center gap-2">
                        <button className="rounded-md border border-border px-3 py-2 text-sm" onClick={() => router.push("/visits")}>← Back</button>
                        {canEdit && (
                            <button className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger" onClick={handleDeleteVisit}>Delete Visit</button>
                        )}
                    </div>
                }
            />

            {successMsg && <div className="card border-success/30 bg-success/10 p-3 text-sm text-success">{successMsg}</div>}

            {/* Visit Details */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="card p-4">
                    <h3 className="mb-3 font-semibold">Visit Information</h3>
                    <div className="space-y-2 text-sm">
                        <div className="flex justify-between"><span className="text-muted">Patient ID</span><span className="text-xs">{visit!.patient_id}</span></div>
                        <div className="flex justify-between"><span className="text-muted">Doctor ID</span><span className="text-xs">{visit!.doctor_patient_id}</span></div>
                        <div className="flex justify-between"><span className="text-muted">Type</span><span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{visit!.visit_type}</span></div>
                    </div>
                </div>
                <div className="card p-4">
                    <h3 className="mb-3 font-semibold">Clinical Notes</h3>
                    <div className="space-y-2 text-sm">
                        <div><span className="text-muted">Chief Complaint:</span><p className="mt-1">{visit!.chief_complaint || "None recorded"}</p></div>
                        <div><span className="text-muted">Doctor Notes:</span><p className="mt-1">{visit!.doctor_notes || "None recorded"}</p></div>
                    </div>
                </div>
            </div>

            {/* Symptoms Section */}
            <div className="card p-4">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold">Symptoms ({symptoms.length})</h3>
                    {canEdit && <button className="text-primary text-sm hover:underline" onClick={() => { setShowSymptom(true); setFormError(null); }}>+ Add Symptom</button>}
                </div>
                {showSymptom && (
                    <form className="mb-4 rounded-md border border-border p-4 space-y-3" onSubmit={addSymptom}>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            <div><label className="mb-1 block text-xs font-medium">Symptom Name *</label><input className="input" value={symptomForm.symptom_name} onChange={(e) => setSymptomForm({ ...symptomForm, symptom_name: e.target.value })} required placeholder="e.g., Fatigue" /></div>
                            <div><label className="mb-1 block text-xs font-medium">Severity (1-10)</label><input className="input" type="number" min="1" max="10" value={symptomForm.severity} onChange={(e) => setSymptomForm({ ...symptomForm, severity: e.target.value })} /></div>
                            <div><label className="mb-1 block text-xs font-medium">Duration (days)</label><input className="input" type="number" min="0" value={symptomForm.duration_days} onChange={(e) => setSymptomForm({ ...symptomForm, duration_days: e.target.value })} /></div>
                        </div>
                        <div><label className="mb-1 block text-xs font-medium">Notes</label><input className="input" value={symptomForm.notes} onChange={(e) => setSymptomForm({ ...symptomForm, notes: e.target.value })} /></div>
                        {formError && <p className="text-xs text-danger">{formError}</p>}
                        <div className="flex gap-2 justify-end"><button type="button" className="text-sm text-muted" onClick={() => setShowSymptom(false)}>Cancel</button><button className="btn-primary text-sm" disabled={submitting}>{submitting ? "Adding..." : "Add"}</button></div>
                    </form>
                )}
                {symptoms.length === 0 ? <p className="text-sm text-muted">No symptoms recorded</p> : (
                    <div className="space-y-2">{symptoms.map((s) => (
                        <div key={s.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                            <div><span className="font-medium">{s.symptom_name}</span>{s.severity ? <span className="ml-2 text-xs text-muted">Severity: {s.severity}/10</span> : null}{s.duration_days ? <span className="ml-2 text-xs text-muted">{s.duration_days}d</span> : null}</div>
                            {s.notes && <span className="text-xs text-muted">{s.notes}</span>}
                        </div>
                    ))}</div>
                )}
            </div>

            {/* Diagnoses Section */}
            <div className="card p-4">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold">Diagnoses ({diagnoses.length})</h3>
                    {canEdit && <button className="text-primary text-sm hover:underline" onClick={() => { setShowDiagnosis(true); setFormError(null); }}>+ Add Diagnosis</button>}
                </div>
                {showDiagnosis && (
                    <form className="mb-4 rounded-md border border-border p-4 space-y-3" onSubmit={addDiagnosis}>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div><label className="mb-1 block text-xs font-medium">Disease Name *</label><input className="input" value={diagnosisForm.disease_name} onChange={(e) => setDiagnosisForm({ ...diagnosisForm, disease_name: e.target.value })} required placeholder="e.g., Type 2 Diabetes" /></div>
                            <div><label className="mb-1 block text-xs font-medium">Status *</label><select className="input" value={diagnosisForm.status} onChange={(e) => setDiagnosisForm({ ...diagnosisForm, status: e.target.value })}><option value="suspected">Suspected</option><option value="confirmed">Confirmed</option></select></div>
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            <div><label className="mb-1 block text-xs font-medium">Date *</label><input className="input" type="datetime-local" value={diagnosisForm.diagnosis_date} onChange={(e) => setDiagnosisForm({ ...diagnosisForm, diagnosis_date: e.target.value })} required /></div>
                            <div><label className="mb-1 block text-xs font-medium">Confidence (0-1)</label><input className="input" type="number" step="0.01" min="0" max="1" value={diagnosisForm.confidence_score} onChange={(e) => setDiagnosisForm({ ...diagnosisForm, confidence_score: e.target.value })} /></div>
                            <div><label className="mb-1 block text-xs font-medium">ML Model</label><input className="input" value={diagnosisForm.ml_model_used} onChange={(e) => setDiagnosisForm({ ...diagnosisForm, ml_model_used: e.target.value })} placeholder="e.g., xgboost_v2" /></div>
                        </div>
                        <div><label className="mb-1 block text-xs font-medium">Notes</label><textarea className="input min-h-[60px]" value={diagnosisForm.notes} onChange={(e) => setDiagnosisForm({ ...diagnosisForm, notes: e.target.value })} /></div>
                        {formError && <p className="text-xs text-danger">{formError}</p>}
                        <div className="flex gap-2 justify-end"><button type="button" className="text-sm text-muted" onClick={() => setShowDiagnosis(false)}>Cancel</button><button className="btn-primary text-sm" disabled={submitting}>{submitting ? "Adding..." : "Add"}</button></div>
                    </form>
                )}
                {diagnoses.length === 0 ? <p className="text-sm text-muted">No diagnoses recorded</p> : (
                    <div className="space-y-2">{diagnoses.map((d) => (
                        <div key={d.diagnosis_id} className="rounded-md border border-border px-3 py-2 text-sm">
                            <div className="flex items-center gap-2">
                                <span className="font-medium">{d.disease_name}</span>
                                <span className={`rounded-full px-2 py-0.5 text-xs ${d.status === "confirmed" ? "bg-danger/10 text-danger" : "bg-warning/10 text-warning"}`}>{d.status}</span>
                                {d.confidence_score != null && <span className="text-xs text-muted">{(d.confidence_score * 100).toFixed(0)}% confidence</span>}
                            </div>
                            {d.notes && <p className="mt-1 text-xs text-muted">{d.notes}</p>}
                        </div>
                    ))}</div>
                )}
            </div>

            {/* Prescriptions Section */}
            <div className="card p-4">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold">Prescriptions ({prescriptions.length})</h3>
                    {canEdit && <button className="text-primary text-sm hover:underline" onClick={() => { setShowPrescription(true); setFormError(null); }}>+ Add Prescription</button>}
                </div>
                {showPrescription && (
                    <form className="mb-4 rounded-md border border-border p-4 space-y-3" onSubmit={addPrescription}>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            <div><label className="mb-1 block text-xs font-medium">Medication Name *</label><input className="input" value={prescriptionForm.medication_name} onChange={(e) => setPrescriptionForm({ ...prescriptionForm, medication_name: e.target.value })} required placeholder="e.g., Metformin" /></div>
                            <div><label className="mb-1 block text-xs font-medium">Dosage *</label><input className="input" value={prescriptionForm.dosage} onChange={(e) => setPrescriptionForm({ ...prescriptionForm, dosage: e.target.value })} required placeholder="e.g., 500mg" /></div>
                            <div><label className="mb-1 block text-xs font-medium">Frequency *</label><input className="input" value={prescriptionForm.frequency} onChange={(e) => setPrescriptionForm({ ...prescriptionForm, frequency: e.target.value })} required placeholder="e.g., Twice daily" /></div>
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div><label className="mb-1 block text-xs font-medium">Duration (days)</label><input className="input" type="number" min="1" value={prescriptionForm.duration_days} onChange={(e) => setPrescriptionForm({ ...prescriptionForm, duration_days: e.target.value })} /></div>
                            <div><label className="mb-1 block text-xs font-medium">Instructions</label><input className="input" value={prescriptionForm.instructions} onChange={(e) => setPrescriptionForm({ ...prescriptionForm, instructions: e.target.value })} placeholder="e.g., Take with meals" /></div>
                        </div>
                        {formError && <p className="text-xs text-danger">{formError}</p>}
                        <div className="flex gap-2 justify-end"><button type="button" className="text-sm text-muted" onClick={() => setShowPrescription(false)}>Cancel</button><button className="btn-primary text-sm" disabled={submitting}>{submitting ? "Adding..." : "Add"}</button></div>
                    </form>
                )}
                {prescriptions.length === 0 ? <p className="text-sm text-muted">No prescriptions recorded</p> : (
                    <div className="space-y-2">{prescriptions.map((p) => (
                        <div key={p.prescription_id} className="rounded-md border border-border px-3 py-2 text-sm">
                            <div className="flex items-center gap-2">
                                <span className="font-medium">{p.medication_name}</span>
                                <span className="text-xs text-muted">{p.dosage} — {p.frequency}</span>
                                {p.duration_days && <span className="text-xs text-muted">({p.duration_days}d)</span>}
                            </div>
                            {p.instructions && <p className="mt-1 text-xs text-muted">{p.instructions}</p>}
                        </div>
                    ))}</div>
                )}
            </div>
        </div>
    );
}
