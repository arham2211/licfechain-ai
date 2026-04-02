"use client";

import { useEffect, useState, FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api-client";
import { getUser } from "@/lib/auth-store";

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
};

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

export default function PatientDetailPage() {
    const params = useParams();
    const router = useRouter();
    const patientId = params.id as string;
    const user = getUser();
    const userRoles = user?.roles ?? [];
    const canEdit = userRoles.some((r) => ["admin", "doctor"].includes(r));
    const canDelete = userRoles.includes("admin");

    const [patient, setPatient] = useState<Patient | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [editForm, setEditForm] = useState<Partial<Patient>>({});
    const [editError, setEditError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    // Family relationships
    const [relationships, setRelationships] = useState<FamilyRelationship[]>([]);
    const [showAddFamily, setShowAddFamily] = useState(false);
    const [familyForm, setFamilyForm] = useState({
        relative_patient_id: "",
        relationship_type: "parent",
        is_blood_relative: true,
    });
    const [addingFamily, setAddingFamily] = useState(false);
    const [familyError, setFamilyError] = useState<string | null>(null);

    useEffect(() => {
        loadPatient();
        loadRelationships();
    }, [patientId]);

    async function loadPatient() {
        try {
            const data = await api.request<Patient>(`/patients/${patientId}`);
            setPatient(data);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load patient");
        }
    }

    async function loadRelationships() {
        try {
            const data = await api.request<{ family_relationships?: FamilyRelationship[] }>(
                `/patients/with-family-tree/list?skip=0&limit=1000`
            );
            // Filter relationships for this patient from the list - fallback to empty
        } catch {
            // silently fail - family tree may not be available for this patient
        }
    }

    function startEdit() {
        if (!patient) return;
        setEditForm({
            first_name: patient.first_name,
            last_name: patient.last_name,
            cnic: patient.cnic,
            date_of_birth: String(patient.date_of_birth).slice(0, 10),
            gender: patient.gender,
            blood_group: patient.blood_group,
            phone: patient.phone,
            email: patient.email,
            address: patient.address,
        });
        setEditing(true);
        setEditError(null);
    }

    async function handleSave(e: FormEvent) {
        e.preventDefault();
        setEditError(null);
        setSaving(true);
        try {
            await api.request<Patient>(`/patients/${patientId}`, {
                method: "PUT",
                body: JSON.stringify(editForm),
            });
            setEditing(false);
            setSuccessMsg("Patient updated successfully");
            setTimeout(() => setSuccessMsg(null), 3000);
            await loadPatient();
        } catch (e) {
            setEditError(e instanceof Error ? e.message : "Failed to update patient");
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete() {
        if (!confirm("Are you sure you want to delete this patient? This action cannot be undone.")) return;
        setDeleting(true);
        try {
            await api.request(`/patients/${patientId}`, { method: "DELETE" });
            router.push("/patients");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to delete patient");
        } finally {
            setDeleting(false);
        }
    }

    async function handleAddFamily(e: FormEvent) {
        e.preventDefault();
        setFamilyError(null);
        setAddingFamily(true);
        try {
            await api.request(`/patients/${patientId}/family/auto`, {
                method: "POST",
                body: JSON.stringify({
                    ...familyForm,
                    auto_infer: true,
                    max_depth: 10,
                }),
            });
            setShowAddFamily(false);
            setFamilyForm({ relative_patient_id: "", relationship_type: "parent", is_blood_relative: true });
            setSuccessMsg("Family relationship added successfully");
            setTimeout(() => setSuccessMsg(null), 3000);
        } catch (e) {
            setFamilyError(e instanceof Error ? e.message : "Failed to add family relationship");
        } finally {
            setAddingFamily(false);
        }
    }

    if (error) {
        return (
            <div className="space-y-4">
                <PageHeader title="Patient Not Found" />
                <div className="card p-4 text-sm text-danger">{error}</div>
                <button className="btn-primary" onClick={() => router.push("/patients")}>
                    Back to Patients
                </button>
            </div>
        );
    }

    if (!patient) {
        return (
            <div className="space-y-4">
                <PageHeader title="Loading..." />
                <div className="card p-4 text-sm text-muted">Loading patient details...</div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <PageHeader
                title={`${patient.first_name} ${patient.last_name}`}
                subtitle={`Patient ID: ${patient.patient_id}`}
                right={
                    <div className="flex items-center gap-2">
                        <button
                            className="rounded-md border border-border px-3 py-2 text-sm"
                            onClick={() => router.push("/patients")}
                        >
                            ← Back
                        </button>
                        {canEdit && !editing && (
                            <button className="btn-primary text-sm" onClick={startEdit}>
                                Edit Patient
                            </button>
                        )}
                        {canDelete && (
                            <button
                                className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
                                onClick={handleDelete}
                                disabled={deleting}
                            >
                                {deleting ? "Deleting..." : "Delete"}
                            </button>
                        )}
                    </div>
                }
            />

            {successMsg && (
                <div className="card border-success/30 bg-success/10 p-3 text-sm text-success">{successMsg}</div>
            )}

            {/* Edit Mode */}
            {editing ? (
                <div className="card p-6">
                    <h2 className="mb-4 text-lg font-semibold">Edit Patient Information</h2>
                    <form className="space-y-4" onSubmit={handleSave}>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div>
                                <label className="mb-1 block text-sm font-medium">First Name</label>
                                <input
                                    className="input"
                                    value={editForm.first_name ?? ""}
                                    onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })}
                                    required
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium">Last Name</label>
                                <input
                                    className="input"
                                    value={editForm.last_name ?? ""}
                                    onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })}
                                    required
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div>
                                <label className="mb-1 block text-sm font-medium">CNIC</label>
                                <input
                                    className="input"
                                    value={editForm.cnic ?? ""}
                                    onChange={(e) => setEditForm({ ...editForm, cnic: e.target.value })}
                                    pattern="\d{5}-\d{7}-\d{1}"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium">Date of Birth</label>
                                <input
                                    className="input"
                                    type="date"
                                    value={editForm.date_of_birth ? String(editForm.date_of_birth).slice(0, 10) : ""}
                                    onChange={(e) => setEditForm({ ...editForm, date_of_birth: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                            <div>
                                <label className="mb-1 block text-sm font-medium">Gender</label>
                                <select
                                    className="input"
                                    value={editForm.gender ?? "male"}
                                    onChange={(e) => setEditForm({ ...editForm, gender: e.target.value })}
                                >
                                    <option value="male">Male</option>
                                    <option value="female">Female</option>
                                    <option value="other">Other</option>
                                </select>
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium">Blood Group</label>
                                <select
                                    className="input"
                                    value={editForm.blood_group ?? "O+"}
                                    onChange={(e) => setEditForm({ ...editForm, blood_group: e.target.value })}
                                >
                                    {BLOOD_GROUPS.map((bg) => (
                                        <option key={bg} value={bg}>{bg}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium">Phone</label>
                                <input
                                    className="input"
                                    value={editForm.phone ?? ""}
                                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div>
                                <label className="mb-1 block text-sm font-medium">Email</label>
                                <input
                                    className="input"
                                    type="email"
                                    value={editForm.email ?? ""}
                                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium">Address</label>
                                <input
                                    className="input"
                                    value={editForm.address ?? ""}
                                    onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                                />
                            </div>
                        </div>
                        {editError ? <p className="text-sm text-danger">{editError}</p> : null}
                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                className="rounded-md border border-border px-4 py-2 text-sm"
                                onClick={() => setEditing(false)}
                            >
                                Cancel
                            </button>
                            <button className="btn-primary" type="submit" disabled={saving}>
                                {saving ? "Saving..." : "Save Changes"}
                            </button>
                        </div>
                    </form>
                </div>
            ) : (
                /* Read-only View */
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <div className="card p-6">
                        <h2 className="mb-4 text-lg font-semibold">Personal Information</h2>
                        <div className="space-y-3 text-sm">
                            <InfoRow label="Full Name" value={`${patient.first_name} ${patient.last_name}`} />
                            <InfoRow label="CNIC" value={patient.cnic} />
                            <InfoRow label="Date of Birth" value={String(patient.date_of_birth).slice(0, 10)} />
                            <InfoRow label="Gender" value={patient.gender} />
                            <InfoRow label="Blood Group" value={patient.blood_group ?? "-"} />
                            <InfoRow label="Phone" value={patient.phone ?? "-"} />
                            <InfoRow label="Email" value={patient.email ?? "-"} />
                            <InfoRow label="Address" value={patient.address ?? "-"} />
                        </div>
                    </div>

                    <div className="card p-6">
                        <h2 className="mb-4 text-lg font-semibold">System Information</h2>
                        <div className="space-y-3 text-sm">
                            <InfoRow label="Patient ID" value={patient.patient_id} />
                            <InfoRow
                                label="Role"
                                value={
                                    patient.is_doctor ? (
                                        <span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs text-primary">
                                            Doctor
                                        </span>
                                    ) : (
                                        <span className="rounded-full bg-success/20 px-2 py-0.5 text-xs text-success">
                                            Patient
                                        </span>
                                    )
                                }
                            />
                            {patient.is_doctor && (
                                <>
                                    <InfoRow label="Specialization" value={patient.specialization ?? "-"} />
                                    <InfoRow label="License #" value={patient.license_number ?? "-"} />
                                    <InfoRow label="Hospital" value={patient.hospital_affiliation ?? "-"} />
                                </>
                            )}
                            <InfoRow label="Created" value={new Date(patient.created_at).toLocaleString()} />
                            <InfoRow label="Last Updated" value={new Date(patient.updated_at).toLocaleString()} />
                        </div>
                    </div>
                </div>
            )}

            {/* Quick Actions */}
            {!editing && (
                <div className="card p-4">
                    <h2 className="mb-3 text-lg font-semibold">Quick Actions</h2>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        {canEdit && (
                            <button
                                className="btn-primary text-sm"
                                onClick={() => setShowAddFamily(true)}
                            >
                                + Add Family Relationship
                            </button>
                        )}
                        {userRoles.some((r) => ["admin", "doctor"].includes(r)) && (
                            <button
                                className="btn-primary text-sm"
                                onClick={() => router.push(`/visits?patient_id=${patientId}`)}
                            >
                                View Visits
                            </button>
                        )}
                        <button
                            className="btn-primary text-sm"
                            onClick={() => router.push(`/reports?patient_id=${patientId}`)}
                        >
                            View Reports
                        </button>
                        <button
                            className="btn-primary text-sm"
                            onClick={() => router.push(`/ml?patient_id=${patientId}`)}
                        >
                            Run ML Diagnosis
                        </button>
                    </div>
                </div>
            )}

            {/* Add Family Relationship Modal */}
            {showAddFamily && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
                    <div className="card w-full max-w-md p-6">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-semibold">Add Family Relationship</h2>
                            <button
                                className="rounded-md border border-border px-3 py-1 text-sm"
                                onClick={() => setShowAddFamily(false)}
                            >
                                ✕
                            </button>
                        </div>
                        <form className="mt-4 space-y-4" onSubmit={handleAddFamily}>
                            <div>
                                <label className="mb-1 block text-sm font-medium">Relative Patient ID *</label>
                                <input
                                    className="input"
                                    value={familyForm.relative_patient_id}
                                    onChange={(e) => setFamilyForm({ ...familyForm, relative_patient_id: e.target.value })}
                                    required
                                    placeholder="UUID of relative"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium">Relationship Type *</label>
                                <select
                                    className="input"
                                    value={familyForm.relationship_type}
                                    onChange={(e) => setFamilyForm({ ...familyForm, relationship_type: e.target.value })}
                                >
                                    <option value="parent">Parent</option>
                                    <option value="child">Child</option>
                                    <option value="sibling">Sibling</option>
                                    <option value="spouse">Spouse</option>
                                    <option value="grandparent">Grandparent</option>
                                    <option value="grandchild">Grandchild</option>
                                    <option value="aunt_uncle">Aunt/Uncle</option>
                                    <option value="niece_nephew">Niece/Nephew</option>
                                    <option value="cousin">Cousin</option>
                                </select>
                            </div>
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="blood_relative"
                                    checked={familyForm.is_blood_relative}
                                    onChange={(e) => setFamilyForm({ ...familyForm, is_blood_relative: e.target.checked })}
                                />
                                <label htmlFor="blood_relative" className="text-sm">Blood relative</label>
                            </div>
                            {familyError ? <p className="text-sm text-danger">{familyError}</p> : null}
                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    className="rounded-md border border-border px-4 py-2 text-sm"
                                    onClick={() => setShowAddFamily(false)}
                                >
                                    Cancel
                                </button>
                                <button className="btn-primary" type="submit" disabled={addingFamily}>
                                    {addingFamily ? "Adding..." : "Add Relationship"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="flex items-start justify-between gap-4 border-b border-border/50 pb-2 last:border-0">
            <span className="text-muted">{label}</span>
            <span className="text-right font-medium">{value}</span>
        </div>
    );
}
