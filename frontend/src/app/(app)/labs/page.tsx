"use client";

import { useEffect, useRef, useState, FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { FlaskConical, Plus, X, Trash2, CheckCircle, AlertTriangle, Loader2, ImagePlus } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api-client";
import { getUser } from "@/lib/auth-store";
import { PatientSearch } from "@/components/ui/PatientSearch";
import { useLanguage } from "@/components/providers/LanguageProvider";

type Lab = { lab_id: string; lab_name: string; lab_location?: string; accreditation_number?: string; phone?: string; email?: string };
type Report = { report_id: string; report_type: string; status: string; report_date: string; patient_id: string; lab_id: string; test_name?: string; performed_by?: string };
type PatientOption = { patient_id: string; first_name: string; last_name: string; cnic: string };
type VisitOption = { visit_id: string; visit_date: string; visit_type: string; chief_complaint?: string | null };
type TestResult = { result_id: string; test_name: string; test_value: number; unit?: string; reference_range_min?: number; reference_range_max?: number; is_abnormal?: boolean };
type OralCancerDetectionResponse = {
  screening_id: string;
  patient_id: string;
  report_id?: string | null;
  visit_id?: string | null;
  diagnosis_id?: string | null;
  progression_id?: string | null;
  diagnosis_label: string;
  progression_stage: string;
  confidence_score: number;
};

type LabsPageContentProps = {
  forcedSection?: "labs" | "reports";
};

function normalizeLabIdentity(value?: string | null): string {
  return (value ?? "").toLowerCase().replace(/[\s_-]+/g, "");
}

const REPORT_TYPE_OPTIONS = [
  "blood_test",
  "urine_test",
  "cbc",
  "kidney_panel",
  "thyroid_panel",
  "parathyroid_panel",
  "oral_cancer_screening",
  "comprehensive_panel",
];
const REPORT_PATIENT_OPTIONS_LIMIT = 20;

export function LabsPageContent({ forcedSection }: LabsPageContentProps = {}) {
  const { tr, language } = useLanguage();
  const searchParams = useSearchParams();
  const sectionParam = forcedSection ?? (searchParams.get("section") === "labs" || searchParams.get("section") === "reports"
    ? (searchParams.get("section") as "labs" | "reports")
    : undefined);
  const showLabsSection = sectionParam !== "reports";
  const showReportsSection = sectionParam !== "labs";
  const user = getUser();
  const userRoles = user?.roles ?? [];
  const initialIsPatient = userRoles.includes("patient");
  const initialPatientId = initialIsPatient ? (user?.patient_id || "") : "";

  const [localViewMode, setLocalViewMode] = useState<"clinical" | "personal">("clinical");
  const [patientId, setPatientId] = useState(initialPatientId);
  const [isPatient, setIsPatient] = useState(initialIsPatient);
  const [authReady, setAuthReady] = useState(false);
  const loadAllRequestId = useRef(0);
  const patientSearchRequestId = useRef(0);

  const canCreateLab = userRoles.some((r) => ["admin", "lab"].includes(r));
  const canCreateReport = userRoles.some((r) => ["admin", "lab", "doctor"].includes(r));

  const [labs, setLabs] = useState<Lab[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Create Lab
  const [showCreateLab, setShowCreateLab] = useState(false);
  const [labForm, setLabForm] = useState({ lab_name: "", lab_location: "", accreditation_number: "", phone: "", email: "" });
  const [creatingLab, setCreatingLab] = useState(false);
  const [labError, setLabError] = useState<string | null>(null);

  // Create Report
  const [showCreateReport, setShowCreateReport] = useState(false);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(false);
  const [patientsError, setPatientsError] = useState<string | null>(null);
  const [patientQuery, setPatientQuery] = useState("");
  const [labQuery, setLabQuery] = useState("");
  const [showPatientOptions, setShowPatientOptions] = useState(false);
  const [showLabOptions, setShowLabOptions] = useState(false);
  const [reportForm, setReportForm] = useState({ patient_id: "", lab_id: "", visit_id: "", report_date: new Date().toISOString().slice(0, 16), report_type: "blood_test", status: "pending", test_name: "", performed_by: "" });
  const [patientVisits, setPatientVisits] = useState<VisitOption[]>([]);
  const [patientVisitsLoading, setPatientVisitsLoading] = useState(false);
  const [patientVisitsError, setPatientVisitsError] = useState<string | null>(null);
  const [creatingReport, setCreatingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [showOralScan, setShowOralScan] = useState(false);
  const [oralPatientQuery, setOralPatientQuery] = useState("");
  const [oralLabQuery, setOralLabQuery] = useState("");
  const [showOralPatientOptions, setShowOralPatientOptions] = useState(false);
  const [showOralLabOptions, setShowOralLabOptions] = useState(false);
  const [detectingOralCancer, setDetectingOralCancer] = useState(false);
  const [oralScanError, setOralScanError] = useState<string | null>(null);
  const [oralScanForm, setOralScanForm] = useState<{
    patient_id: string;
    lab_id: string;
    image: File | null;
    auto_save: boolean;
  }>({
    patient_id: "",
    lab_id: "",
    image: null,
    auto_save: true,
  });

  // View Report Modal
  const [viewingReport, setViewingReport] = useState<Report | null>(null);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [testResults, setTestResults] = useState<TestResult[]>([]);

  // Managing results (Admin/Doctor)
  const [showAddResult, setShowAddResult] = useState(false);
  const [resultForm, setResultForm] = useState({ test_name: "", test_value: "", unit: "" });
  const [addingResult, setAddingResult] = useState(false);
  const [resultError, setResultError] = useState<string | null>(null);
  const [reportStatusFilter, setReportStatusFilter] = useState<"all" | "pending" | "completed">("all");

  useEffect(() => {
    const u = getUser();
    if (!u) {
      setAuthReady(true);
      return;
    }
    const isPrimaryPatient = u.roles.includes("patient");
    const isDoctor = u.roles.includes("doctor");

    if (isPrimaryPatient) {
      setIsPatient(true);
      setPatientId(u.patient_id || "");
    } else if (isDoctor && u.patient_id && localViewMode === "personal") {
      setIsPatient(true);
      setPatientId(u.patient_id || "");
    } else {
      setIsPatient(false);
      // Keep patientId as whatever was searched/selected, or empty
    }
    setAuthReady(true);
  }, [localViewMode]);

  useEffect(() => {
    if (!authReady) return;
    loadAll();
  }, [authReady, patientId, localViewMode, language, reportStatusFilter]);

  async function loadAll() {
    const requestId = ++loadAllRequestId.current;
    try {
      // Prevent patient view from accidentally loading global reports before patientId resolves.
      if (isPatient && !patientId) return;

      const loadedLabs = await api.request<Lab[]>("/labs/?skip=0&limit=200");
      if (requestId !== loadAllRequestId.current) return;
      setLabs(loadedLabs);

      const isLabOnlySession =
        userRoles.includes("lab") && !userRoles.includes("admin") && !userRoles.includes("doctor") && !isPatient;
      let effectiveLabId = "";
      if (isLabOnlySession) {
        const normalizedUsername = normalizeLabIdentity(user?.username);
        const matchedLab =
          loadedLabs.find((l) => normalizeLabIdentity(l.lab_name) === normalizedUsername) ??
          loadedLabs.find((l) => normalizeLabIdentity(l.lab_name).includes(normalizedUsername)) ??
          loadedLabs.find((l) => normalizedUsername.includes(normalizeLabIdentity(l.lab_name)));
        effectiveLabId = matchedLab?.lab_id ?? "";
      }

      const effectivePatientId = patientId || (isPatient ? (user?.patient_id || "") : "");
      const statusQuery = reportStatusFilter === "all" ? "" : `&status=${encodeURIComponent(reportStatusFilter)}`;
      let reportsUrl = `/labs/reports?skip=0&limit=100${statusQuery}`;
      if (effectivePatientId) {
        reportsUrl = `/labs/reports?patient_id=${effectivePatientId}&skip=0&limit=100${statusQuery}`;
      } else if (effectiveLabId) {
        reportsUrl = `/labs/reports?lab_id=${effectiveLabId}&skip=0&limit=100${statusQuery}`;
      }

      const r = await api.request<Report[]>(reportsUrl);
      if (requestId !== loadAllRequestId.current) return;
      setReports(r);
    } catch (e) {
      if (requestId !== loadAllRequestId.current) return;
      setError(e instanceof Error ? e.message : tr("failedToLoadLabs"));
    }
  }

  async function handleCreateLab(e: FormEvent) {
    e.preventDefault(); setLabError(null); setCreatingLab(true);
    try {
      await api.request("/labs/", {
        method: "POST", body: JSON.stringify({
          lab_name: labForm.lab_name, lab_location: labForm.lab_location || null,
          accreditation_number: labForm.accreditation_number || null, phone: labForm.phone || null, email: labForm.email || null,
        })
      });
      setShowCreateLab(false); setLabForm({ lab_name: "", lab_location: "", accreditation_number: "", phone: "", email: "" });
      setSuccessMsg(tr("labCreated")); setTimeout(() => setSuccessMsg(null), 3000); await loadAll();
    } catch (e) { setLabError(e instanceof Error ? e.message : tr("failedToCreateLab")); } finally { setCreatingLab(false); }
  }

  function openCreateReport() {
    setShowCreateReport(true);
    setPatientQuery("");
    setLabQuery("");
    setReportForm((prev) => ({ ...prev, patient_id: "", lab_id: "", visit_id: "" }));
    setPatientVisits([]);
    setPatientVisitsError(null);
  }

  async function loadPatientsForSelection(searchQuery = "") {
    const requestId = ++patientSearchRequestId.current;
    setPatientsLoading(true);
    setPatientsError(null);
    try {
      const q = searchQuery.trim();
      const searchPart = q ? `&search=${encodeURIComponent(q)}` : "";
      const p = await api.request<PatientOption[]>(`/patients/?skip=0&limit=${REPORT_PATIENT_OPTIONS_LIMIT}${searchPart}`);
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

  function openOralScanModal() {
    setShowOralScan(true);
    setOralScanError(null);
    setOralPatientQuery("");
    setOralLabQuery("");
    setOralScanForm({
      patient_id: "",
      lab_id: "",
      image: null,
      auto_save: true,
    });
  }

  useEffect(() => {
    if (!showCreateReport) return;
    const timer = setTimeout(() => {
      loadPatientsForSelection(patientQuery);
    }, 250);
    return () => clearTimeout(timer);
  }, [showCreateReport, patientQuery]);

  useEffect(() => {
    if (!showCreateReport || !reportForm.patient_id) {
      setPatientVisits([]);
      setPatientVisitsError(null);
      return;
    }
    let cancelled = false;
    const loadVisits = async () => {
      setPatientVisitsLoading(true);
      setPatientVisitsError(null);
      try {
        const visits = await api.request<VisitOption[]>(
          `/labs/patient-visits?patient_id=${encodeURIComponent(reportForm.patient_id)}&skip=0&limit=100`
        );
        if (cancelled) return;
        setPatientVisits(visits);
      } catch (e) {
        if (cancelled) return;
        setPatientVisits([]);
        setPatientVisitsError(e instanceof Error ? e.message : tr("failed"));
      } finally {
        if (cancelled) return;
        setPatientVisitsLoading(false);
      }
    };
    loadVisits();
    return () => {
      cancelled = true;
    };
  }, [showCreateReport, reportForm.patient_id, language, tr]);

  useEffect(() => {
    if (!showOralScan) return;
    const timer = setTimeout(() => {
      loadPatientsForSelection(oralPatientQuery);
    }, 250);
    return () => clearTimeout(timer);
  }, [showOralScan, oralPatientQuery]);

  async function handleCreateReport(e: FormEvent) {
    e.preventDefault(); setReportError(null); setCreatingReport(true);
    if (!reportForm.patient_id || !reportForm.lab_id) {
      setReportError("Please select a patient and lab from the dropdown options.");
      setCreatingReport(false);
      return;
    }
    try {
      await api.request("/labs/reports/", {
        method: "POST", body: JSON.stringify({
          ...reportForm, report_date: new Date(reportForm.report_date).toISOString(),
          test_name: reportForm.test_name || null, pdf_url: null, visit_id: reportForm.visit_id || null,
        })
      });
      setShowCreateReport(false); setReportForm({ patient_id: "", lab_id: "", visit_id: "", report_date: new Date().toISOString().slice(0, 16), report_type: "blood_test", status: "pending", test_name: "", performed_by: "" });
      setPatientVisits([]);
      setSuccessMsg(tr("reportCreated")); setTimeout(() => setSuccessMsg(null), 3000); await loadAll();
    } catch (e) { setReportError(e instanceof Error ? e.message : tr("failedToCreateReport")); } finally { setCreatingReport(false); }
  }

  const filteredPatients = patients
    .filter((p) => {
      const q = patientQuery.trim().toLowerCase();
      if (!q) return true;
      const full = `${p.first_name} ${p.last_name}`.toLowerCase();
      return full.includes(q) || p.cnic.toLowerCase().includes(q);
    })
    .slice(0, 20);

  const filteredLabs = labs
    .filter((l) => {
      const q = labQuery.trim().toLowerCase();
      if (!q) return true;
      return l.lab_name.toLowerCase().includes(q) || (l.lab_location ?? "").toLowerCase().includes(q);
    })
    .slice(0, 20);

  const filteredReports = reports.filter((r) =>
    reportStatusFilter === "all" ? true : r.status === reportStatusFilter
  );
  const filteredOralPatients = patients
    .filter((p) => {
      const q = oralPatientQuery.trim().toLowerCase();
      if (!q) return true;
      const full = `${p.first_name} ${p.last_name}`.toLowerCase();
      return full.includes(q) || p.cnic.toLowerCase().includes(q);
    })
    .slice(0, 20);
  const filteredOralLabs = labs
    .filter((l) => {
      const q = oralLabQuery.trim().toLowerCase();
      if (!q) return true;
      return l.lab_name.toLowerCase().includes(q) || (l.lab_location ?? "").toLowerCase().includes(q);
    })
    .slice(0, 20);

  async function handleRunOralScan(e: FormEvent) {
    e.preventDefault();
    setOralScanError(null);

    if (!oralScanForm.patient_id || !oralScanForm.lab_id || !oralScanForm.image) {
      setOralScanError("Please select patient, lab, and oral image.");
      return;
    }

    setDetectingOralCancer(true);
    try {
      const formData = new FormData();
      formData.append("patient_id", oralScanForm.patient_id);
      formData.append("lab_id", oralScanForm.lab_id);
      formData.append("image", oralScanForm.image);
      formData.append("auto_save", oralScanForm.auto_save ? "true" : "false");

      const response = await api.request<OralCancerDetectionResponse>("/ml/oral-cancer/detect", {
        method: "POST",
        body: formData,
      });

      setShowOralScan(false);
      setSuccessMsg(
        `Oral scan completed: ${response.diagnosis_label} (${Math.round((response.confidence_score ?? 0) * 100)}%)`
      );
      setTimeout(() => setSuccessMsg(null), 4000);
      await loadAll();
    } catch (e) {
      setOralScanError(e instanceof Error ? e.message : tr("failed"));
    } finally {
      setDetectingOralCancer(false);
    }
  }

  async function selectReport(report: Report) {
    setViewingReport(report);
    setViewModalOpen(true);
    try {
      const data = await api.request<TestResult[]>(`/labs/reports/${report.report_id}/test-results`);
      setTestResults(data);
    } catch {
      setTestResults([]);
    }
  }

  async function handleAddResult(e: FormEvent) {
    if (!viewingReport) return;
    e.preventDefault(); setResultError(null); setAddingResult(true);
    try {
      await api.request(`/labs/reports/${viewingReport.report_id}/test-results`, {
        method: "POST", body: JSON.stringify({
          test_name: resultForm.test_name, test_value: parseFloat(resultForm.test_value), unit: resultForm.unit || null,
        })
      });
      setShowAddResult(false); setResultForm({ test_name: "", test_value: "", unit: "" });
      setSuccessMsg(tr("testResultAdded")); setTimeout(() => setSuccessMsg(null), 3000);
      await selectReport(viewingReport);
    } catch (e) { setResultError(e instanceof Error ? e.message : tr("failedToAddResult")); } finally { setAddingResult(false); }
  }

  async function handleDeleteLab(labId: string) {
    if (!confirm(tr("confirmDeleteLab"))) return;
    try { await api.request(`/labs/${labId}`, { method: "DELETE" }); await loadAll(); } catch (e) { setError(e instanceof Error ? e.message : tr("failed")); }
  }

  async function handleDeleteReport(reportId: string) {
    if (!confirm(tr("confirmDeleteReport"))) return;
    try {
      await api.request(`/labs/reports/${reportId}`, { method: "DELETE" });
      if (viewingReport?.report_id === reportId) {
        setViewingReport(null);
        setTestResults([]);
        setViewModalOpen(false);
      }
      await loadAll();
    } catch (e) { setError(e instanceof Error ? e.message : tr("failed")); }
  }

  async function handleMarkReportCompleted(reportId: string) {
    try {
      await api.request(`/labs/reports/${reportId}`, {
        method: "PUT",
        body: JSON.stringify({ status: "completed" }),
      });
      if (viewingReport?.report_id === reportId) {
        setViewingReport({ ...viewingReport, status: "completed" });
      }
      setSuccessMsg("Report marked as completed");
      setTimeout(() => setSuccessMsg(null), 3000);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("failed"));
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="space-y-4">
      <PageHeader
        title={isPatient ? tr("myLabReports") : tr("labsAndReports")}
        subtitle={isPatient ? tr("myLabReportsSubtitle") : tr("labsAndReportsSubtitle")}
        icon={<FlaskConical size={20} />}
        right={
          <div className="flex flex-col md:flex-row items-end md:items-center gap-4">
            {!isPatient && (
              <div className="flex items-center gap-2 overflow-visible relative z-40">
                <PatientSearch onSelect={setPatientId} className="w-64" />
                {showLabsSection && canCreateLab && <button className="btn-primary text-sm whitespace-nowrap" onClick={() => setShowCreateLab(true)}><Plus size={16} /> {tr("newLab")}</button>}
                {showReportsSection && canCreateReport && <button className="btn-primary text-sm whitespace-nowrap" onClick={openCreateReport}><Plus size={16} /> {tr("newReport")}</button>}
                {showReportsSection && canCreateReport && (
                  <button className="btn-primary text-sm whitespace-nowrap" onClick={openOralScanModal}>
                    <ImagePlus size={16} /> Oral Scan
                  </button>
                )}
              </div>
            )}

            {false && user?.roles.includes("doctor") && user?.patient_id && (
              <div className="flex items-center gap-1 rounded-full bg-slate-100 p-1">
                <button
                  onClick={() => setLocalViewMode("clinical")}
                  className={`px-3 py-1.5 text-xs font-bold rounded-full transition ${localViewMode === "clinical" ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                >
                  {tr("clinical")}
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
      {successMsg && <div className="alert-success">{successMsg}</div>}

      {/* Create Lab Modal */}
      {showCreateLab && (
        <div className="modal-overlay">
          <div className="card w-full max-w-lg p-6">
            <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">{tr("createLab")}</h2><button className="btn-ghost text-sm" onClick={() => setShowCreateLab(false)}><X size={16} /></button></div>
            <form className="mt-4 space-y-4" onSubmit={handleCreateLab}>
              <div><label className="mb-1 block text-sm font-medium">{tr("labName")} *</label><input className="input" value={labForm.lab_name} onChange={(e) => setLabForm({ ...labForm, lab_name: e.target.value })} required placeholder="e.g., Chughtai Lab" /></div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div><label className="mb-1 block text-sm font-medium">{tr("location")}</label><input className="input" value={labForm.lab_location} onChange={(e) => setLabForm({ ...labForm, lab_location: e.target.value })} /></div>
                <div><label className="mb-1 block text-sm font-medium">{tr("accreditation")}</label><input className="input" value={labForm.accreditation_number} onChange={(e) => setLabForm({ ...labForm, accreditation_number: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div><label className="mb-1 block text-sm font-medium">{tr("phone")}</label><input className="input" value={labForm.phone} onChange={(e) => setLabForm({ ...labForm, phone: e.target.value })} /></div>
                <div><label className="mb-1 block text-sm font-medium">{tr("email")}</label><input className="input" type="email" value={labForm.email} onChange={(e) => setLabForm({ ...labForm, email: e.target.value })} /></div>
              </div>
              {labError && <p className="text-sm text-danger">{labError}</p>}
              <div className="flex justify-end gap-2"><button type="button" className="btn-ghost text-sm" onClick={() => setShowCreateLab(false)}>{tr("cancel")}</button><button className="btn-primary" disabled={creatingLab}>{creatingLab ? tr("creating") : tr("createLab")}</button></div>
            </form>
          </div>
        </div>
      )}

      {/* Create Report Modal */}
      {showCreateReport && (
        <div className="modal-overlay">
          <div className="card w-full max-w-2xl overflow-hidden p-0">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h2 className="text-lg font-semibold">{tr("createLabReport")}</h2>
              <button className="btn-ghost text-sm" onClick={() => setShowCreateReport(false)}>
                <X size={16} />
              </button>
            </div>
            <form className="max-h-[80vh] space-y-5 overflow-y-auto p-6" onSubmit={handleCreateReport}>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium">{tr("patient")} *</label>
                  <div className="relative">
                    <input
                      className="input w-full"
                      value={patientQuery}
                      onChange={(e) => {
                        setPatientQuery(e.target.value);
                        setReportForm((prev) => ({ ...prev, patient_id: "", visit_id: "" }));
                        setShowPatientOptions(true);
                      }}
                      onFocus={() => setShowPatientOptions(true)}
                      onBlur={() => setTimeout(() => setShowPatientOptions(false), 120)}
                      placeholder={patientsLoading ? tr("loading") : "Type patient name or CNIC"}
                      disabled={patientsLoading}
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
                              setReportForm((prev) => ({ ...prev, patient_id: p.patient_id, visit_id: "" }));
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
                  <label className="mb-1 block text-sm font-medium">{tr("lab")} *</label>
                  <div className="relative">
                    <input
                      className="input w-full"
                      value={labQuery}
                      onChange={(e) => {
                        setLabQuery(e.target.value);
                        setReportForm((prev) => ({ ...prev, lab_id: "" }));
                        setShowLabOptions(true);
                      }}
                      onFocus={() => setShowLabOptions(true)}
                      onBlur={() => setTimeout(() => setShowLabOptions(false), 120)}
                      placeholder="Type lab name"
                    />
                    {showLabOptions && (
                      <div className="absolute left-0 right-0 top-full z-[12000] mt-2 max-h-56 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-1 shadow-2xl">
                        {filteredLabs.length > 0 ? filteredLabs.map((l) => (
                          <button
                            key={l.lab_id}
                            type="button"
                            className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-100 hover:bg-slate-800 transition"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setReportForm((prev) => ({ ...prev, lab_id: l.lab_id }));
                              setLabQuery(l.lab_name);
                              setShowLabOptions(false);
                            }}
                          >
                            {l.lab_name}
                          </button>
                        )) : <div className="px-3 py-2 text-xs text-slate-400">No matching labs</div>}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium">{tr("reportType")} *</label>
                  <select
                    className="input w-full"
                    value={reportForm.report_type}
                    onChange={(e) => setReportForm({ ...reportForm, report_type: e.target.value })}
                    required
                  >
                    {REPORT_TYPE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">{tr("status")}</label>
                  <select
                    className="input w-full"
                    value={reportForm.status}
                    onChange={(e) => setReportForm({ ...reportForm, status: e.target.value })}
                  >
                    <option value="pending">{tr("pending")}</option>
                    <option value="completed">{tr("completed")}</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium">Linked Visit (Optional)</label>
                  <select
                    className="input w-full"
                    value={reportForm.visit_id}
                    onChange={(e) => setReportForm({ ...reportForm, visit_id: e.target.value })}
                    disabled={!reportForm.patient_id || patientVisitsLoading}
                  >
                    <option value="">{patientVisitsLoading ? tr("loading") : "No linked visit"}</option>
                    {patientVisits.map((v) => (
                      <option key={v.visit_id} value={v.visit_id}>
                        {new Date(v.visit_date).toLocaleDateString()} - {v.visit_type.replace(/_/g, " ")}{v.chief_complaint ? ` - ${v.chief_complaint}` : ""}
                      </option>
                    ))}
                  </select>
                  {patientVisitsError && <p className="mt-1 text-xs text-danger">{patientVisitsError}</p>}
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">{tr("date")} *</label>
                  <input
                    className="input w-full"
                    type="datetime-local"
                    value={reportForm.report_date}
                    onChange={(e) => setReportForm({ ...reportForm, report_date: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">{tr("testName")}</label>
                  <input
                    className="input w-full"
                    value={reportForm.test_name}
                    onChange={(e) => setReportForm({ ...reportForm, test_name: e.target.value })}
                    placeholder="e.g., HbA1c"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">{tr("performedBy")}</label>
                <input
                  className="input w-full"
                  value={reportForm.performed_by}
                  onChange={(e) => setReportForm({ ...reportForm, performed_by: e.target.value })}
                  placeholder={tr("performedByPlaceholder")}
                />
              </div>
              {reportError && <p className="text-sm text-danger">{reportError}</p>}
              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <button type="button" className="btn-ghost text-sm" onClick={() => setShowCreateReport(false)}>
                  {tr("cancel")}
                </button>
                <button className="btn-primary" disabled={creatingReport}>
                  {creatingReport ? tr("creating") : tr("createReport")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Oral Cancer Scan Modal */}
      {showOralScan && (
        <div className="modal-overlay">
          <div className="card w-full max-w-2xl overflow-hidden p-0">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h2 className="text-lg font-semibold">Oral Cancer Detection</h2>
              <button className="btn-ghost text-sm" onClick={() => setShowOralScan(false)}>
                <X size={16} />
              </button>
            </div>

            <form className="max-h-[80vh] space-y-5 overflow-y-auto p-6" onSubmit={handleRunOralScan}>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium">{tr("patient")} *</label>
                  <div className="relative">
                    <input
                      className="input w-full"
                      value={oralPatientQuery}
                      onChange={(e) => {
                        setOralPatientQuery(e.target.value);
                        setOralScanForm((prev) => ({ ...prev, patient_id: "" }));
                        setShowOralPatientOptions(true);
                      }}
                      onFocus={() => setShowOralPatientOptions(true)}
                      onBlur={() => setTimeout(() => setShowOralPatientOptions(false), 120)}
                      placeholder={patientsLoading ? tr("loading") : "Type patient name or CNIC"}
                      disabled={patientsLoading}
                    />
                    {showOralPatientOptions && !patientsLoading && (
                      <div className="absolute left-0 right-0 top-full z-[12000] mt-2 max-h-56 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-1 shadow-2xl">
                        {filteredOralPatients.length > 0 ? filteredOralPatients.map((p) => (
                          <button
                            key={p.patient_id}
                            type="button"
                            className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-100 hover:bg-slate-800 transition"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setOralScanForm((prev) => ({ ...prev, patient_id: p.patient_id }));
                              setOralPatientQuery(`${p.first_name} ${p.last_name} (${p.cnic})`);
                              setShowOralPatientOptions(false);
                            }}
                          >
                            {p.first_name} {p.last_name} ({p.cnic})
                          </button>
                        )) : <div className="px-3 py-2 text-xs text-slate-400">No matching patients</div>}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">{tr("lab")} *</label>
                  <div className="relative">
                    <input
                      className="input w-full"
                      value={oralLabQuery}
                      onChange={(e) => {
                        setOralLabQuery(e.target.value);
                        setOralScanForm((prev) => ({ ...prev, lab_id: "" }));
                        setShowOralLabOptions(true);
                      }}
                      onFocus={() => setShowOralLabOptions(true)}
                      onBlur={() => setTimeout(() => setShowOralLabOptions(false), 120)}
                      placeholder="Type lab name"
                    />
                    {showOralLabOptions && (
                      <div className="absolute left-0 right-0 top-full z-[12000] mt-2 max-h-56 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-1 shadow-2xl">
                        {filteredOralLabs.length > 0 ? filteredOralLabs.map((l) => (
                          <button
                            key={l.lab_id}
                            type="button"
                            className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-100 hover:bg-slate-800 transition"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setOralScanForm((prev) => ({ ...prev, lab_id: l.lab_id }));
                              setOralLabQuery(l.lab_name);
                              setShowOralLabOptions(false);
                            }}
                          >
                            {l.lab_name}
                          </button>
                        )) : <div className="px-3 py-2 text-xs text-slate-400">No matching labs</div>}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Oral Image *</label>
                <input
                  className="input w-full"
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    setOralScanForm((prev) => ({ ...prev, image: file }));
                  }}
                  required
                />
                <p className="mt-1 text-xs text-muted">Supported: JPG, PNG, WEBP</p>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={oralScanForm.auto_save}
                  onChange={(e) => setOralScanForm((prev) => ({ ...prev, auto_save: e.target.checked }))}
                />
                Auto-create diagnosis and disease progression entries
              </label>

              {oralScanError && <p className="text-sm text-danger">{oralScanError}</p>}

              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <button type="button" className="btn-ghost text-sm" onClick={() => setShowOralScan(false)}>
                  {tr("cancel")}
                </button>
                <button className="btn-primary" disabled={detectingOralCancer}>
                  {detectingOralCancer ? (
                    <span className="inline-flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> Running Model...</span>
                  ) : (
                    "Run Oral Scan"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Patient view or Clinical view with focused patient: Just their reports */}
      {isPatient || patientId ? (
        <div className="card p-0 overflow-x-auto overflow-visible relative">
          <div className="flex flex-col gap-3 border-b border-border px-5 py-3 md:flex-row md:items-center md:justify-between">
            <div className="font-semibold gradient-text">
              {isPatient ? tr("myReports") : tr("patientReports")} ({filteredReports.length})
            </div>
            <div className="inline-flex items-center gap-1 rounded-full border border-border bg-slate-100/40 p-1">
              <button
                type="button"
                onClick={() => setReportStatusFilter("all")}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${reportStatusFilter === "all" ? "bg-white text-primary shadow-sm" : "text-muted hover:text-foreground"}`}
              >
                Both
              </button>
              <button
                type="button"
                onClick={() => setReportStatusFilter("pending")}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${reportStatusFilter === "pending" ? "bg-warning/20 text-warning" : "text-muted hover:text-foreground"}`}
              >
                {tr("pending")}
              </button>
              <button
                type="button"
                onClick={() => setReportStatusFilter("completed")}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${reportStatusFilter === "completed" ? "bg-success/20 text-success" : "text-muted hover:text-foreground"}`}
              >
                {tr("completed")}
              </button>
            </div>
          </div>
          <table className="w-full min-w-[500px] text-sm">
            <thead className="table-header"><tr><th className="px-4 py-3 text-left">{tr("type")}</th><th className="px-4 py-3 text-left">{tr("status")}</th><th className="px-4 py-3 text-left">{tr("date")}</th><th className="px-4 py-3 text-left">{tr("test")}</th></tr></thead>
            <tbody>
              {filteredReports.map((r) => (
                <tr key={r.report_id} className={`table-row cursor-pointer transition ${viewingReport?.report_id === r.report_id ? "bg-primary/5" : "hover:bg-primary/5"}`} onClick={() => selectReport(r)}>
                  <td className="px-4 py-3 capitalize">{r.report_type.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3"><span className={`badge ${r.status === "completed" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>{tr(r.status)}</span></td>
                  <td className="px-4 py-3">{String(r.report_date).slice(0, 10)}</td>
                  <td className="px-4 py-3">{r.test_name ?? "-"}</td>
                </tr>
              ))}
              {filteredReports.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted">{tr("noLabReportsFound")}</td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        /* Admin/Doctor/Lab view: Labs + Reports */
        <div className={`grid grid-cols-1 gap-4 ${showLabsSection && showReportsSection ? "xl:grid-cols-2" : ""}`}>
          {showLabsSection && <div className="card overflow-x-auto p-0">
            <div className="border-b border-border px-4 py-3 font-semibold">{tr("labs")} ({labs.length})</div>
            <table className="w-full min-w-[400px] text-sm">
              <thead className="table-header"><tr><th className="px-4 py-3 text-left">{tr("name")}</th><th className="px-4 py-3 text-left">{tr("location")}</th><th className="px-4 py-3 text-left">{tr("accreditationShort")}</th>{canCreateLab && <th className="px-4 py-3 text-left">{tr("actions")}</th>}</tr></thead>
              <tbody>
                {labs.map((lab) => (
                  <tr key={lab.lab_id} className="table-row"><td className="px-4 py-3 font-medium">{lab.lab_name}</td><td className="px-4 py-3">{lab.lab_location ?? "-"}</td><td className="px-4 py-3">{lab.accreditation_number ?? "-"}</td>{canCreateLab && <td className="px-4 py-3"><button className="text-danger hover:text-danger/80 transition" onClick={() => handleDeleteLab(lab.lab_id)}><Trash2 size={14} /></button></td>}</tr>
                ))}
              </tbody>
            </table>
          </div>}
          {showReportsSection && <div className="card overflow-x-auto p-0">
            <div className="flex flex-col gap-3 border-b border-border px-4 py-3 md:flex-row md:items-center md:justify-between">
              <div className="font-semibold">{tr("reports")} ({filteredReports.length})</div>
              <div className="inline-flex items-center gap-1 rounded-full border border-border bg-slate-100/40 p-1">
                <button
                  type="button"
                  onClick={() => setReportStatusFilter("all")}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${reportStatusFilter === "all" ? "bg-white text-primary shadow-sm" : "text-muted hover:text-foreground"}`}
                >
                  Both
                </button>
                <button
                  type="button"
                  onClick={() => setReportStatusFilter("pending")}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${reportStatusFilter === "pending" ? "bg-warning/20 text-warning" : "text-muted hover:text-foreground"}`}
                >
                  {tr("pending")}
                </button>
                <button
                  type="button"
                  onClick={() => setReportStatusFilter("completed")}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${reportStatusFilter === "completed" ? "bg-success/20 text-success" : "text-muted hover:text-foreground"}`}
                >
                  {tr("completed")}
                </button>
              </div>
            </div>
            <table className="w-full min-w-[400px] text-sm">
              <thead className="table-header"><tr><th className="px-4 py-3 text-left">{tr("type")}</th><th className="px-4 py-3 text-left">{tr("status")}</th><th className="px-4 py-3 text-left">{tr("date")}</th><th className="px-4 py-3 text-left">{tr("actions")}</th></tr></thead>
              <tbody>
                {filteredReports.map((r) => (
                  <tr key={r.report_id} className={`table-row cursor-pointer transition ${viewingReport?.report_id === r.report_id ? "bg-primary/5" : "hover:bg-primary/5"}`} onClick={() => selectReport(r)}>
                    <td className="px-4 py-3 capitalize">{r.report_type.replace(/_/g, " ")}</td>
                    <td className="px-4 py-3"><span className={`badge ${r.status === "completed" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>{tr(r.status)}</span></td>
                    <td className="px-4 py-3">{String(r.report_date).slice(0, 10)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {r.status === "pending" && (
                          <button
                            className="text-success hover:text-success/80 transition"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMarkReportCompleted(r.report_id);
                            }}
                            title="Mark Completed"
                          >
                            <CheckCircle size={16} />
                          </button>
                        )}
                        <button className="text-danger hover:text-danger/80 transition" onClick={(e) => { e.stopPropagation(); handleDeleteReport(r.report_id); }} title={tr("delete")}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredReports.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted">{tr("noLabReportsFound")}</td></tr>}
              </tbody>
            </table>
          </div>}
        </div>
      )}

      {/* Professional View Report Modal */}
      {viewModalOpen && viewingReport && (
        <div className="modal-overlay z-[100] p-4 flex items-center justify-center overflow-hidden">
          <div className="bg-white text-slate-900 w-full max-w-4xl max-h-[95vh] rounded-xl shadow-2xl flex flex-col relative overflow-hidden print:shadow-none print:m-0 print:max-h-none">
            <button className="absolute top-4 right-4 z-10 p-2 hover:bg-slate-100 rounded-full transition no-print" onClick={() => setViewModalOpen(false)}>
              <X size={20} className="text-slate-500" />
            </button>

            <div className="flex-1 overflow-y-auto">
              <div className="p-8 border-b-4 border-primary bg-slate-50 flex flex-col md:flex-row justify-between items-start gap-6">
                <div>
                  <div className="flex items-center gap-2 text-primary mb-2">
                    <FlaskConical size={24} />
                    <h2 className="text-xl font-bold">{labs.find(l => l.lab_id === viewingReport.lab_id)?.lab_name || tr("laboratory")}</h2>
                  </div>
                  <div className="text-sm text-slate-500">
                    <p>{labs.find(l => l.lab_id === viewingReport.lab_id)?.lab_location}</p>
                    <p>{tr("accreditationLabel")}: {labs.find(l => l.lab_id === viewingReport.lab_id)?.accreditation_number}</p>
                  </div>
                </div>
                <div className="md:text-right">
                  <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tight">{tr("labReport")}</h1>
                  <p className="text-sm text-slate-500">{tr("idLabel")}: {viewingReport.report_id.slice(0, 8).toUpperCase()}</p>
                  <p className="text-sm text-slate-500">{tr("date")}: {new Date(viewingReport.report_date).toLocaleDateString()}</p>
                  <div className="mt-2">
                    <span className={`badge ${viewingReport.status === 'completed' ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'}`}>
                      {tr(viewingReport.status).toUpperCase()}
                    </span>
                  </div>
                  {viewingReport.performed_by && (
                    <p className="mt-1 text-xs font-semibold text-slate-400 italic">{tr("performedByShort")}: {viewingReport.performed_by}</p>
                  )}
                </div>
              </div>

              <div className="p-8 space-y-8">
                <div>
                  <h3 className="text-lg font-bold border-l-4 border-primary pl-3 mb-4">{viewingReport.test_name || tr("diagnosticResults")}</h3>
                  {testResults.length === 0 ? (
                    <div className="py-12 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      <p className="text-slate-400">{tr("noResultsRecorded")}</p>
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-xl border border-slate-200">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50">
                          <tr className="text-[10px] font-bold uppercase text-slate-400">
                            <th className="px-4 py-3 text-left">{tr("test")}</th>
                            <th className="px-4 py-3 text-center">{tr("value")}</th>
                            <th className="px-4 py-3 text-center">{tr("status")}</th>
                            <th className="px-4 py-3 text-right">{tr("referenceRange")}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {testResults.map((t) => (
                            <tr key={t.result_id} className="hover:bg-slate-50/50">
                              <td className="px-4 py-4 font-medium capitalize">{t.test_name.replace(/_/g, " ")}</td>
                              <td className="px-4 py-4 text-center font-bold">{t.test_value} <span className="text-xs font-normal text-slate-400">{t.unit}</span></td>
                              <td className="px-4 py-4 text-center">
                                {t.is_abnormal ? <span className="text-[10px] font-bold text-danger bg-danger/10 px-2 py-0.5 rounded">{tr("abnormalUpper")}</span> : <span className="text-[10px] font-bold text-success bg-success/10 px-2 py-0.5 rounded">{tr("normalUpper")}</span>}
                              </td>
                              <td className="px-4 py-4 text-right text-slate-400 font-mono text-xs">
                                {t.reference_range_min} - {t.reference_range_max}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Add Result Section (Only for Lab/Admin) */}
                {canCreateReport && (
                  <div className="no-print bg-slate-50 rounded-xl p-6 border border-slate-200">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="font-bold flex items-center gap-2"><Plus size={16} /> {tr("addTestResult")}</h4>
                      {!showAddResult && <button className="btn-primary text-xs" onClick={() => setShowAddResult(true)}>{tr("enterResult")}</button>}
                    </div>

                    {showAddResult && (
                      <form className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end" onSubmit={handleAddResult}>
                        <div className="md:col-span-2">
                          <label className="block text-xs font-bold text-slate-500 mb-1">{tr("testName")} *</label>
                          <input className="input input-light" value={resultForm.test_name} onChange={(e) => setResultForm({ ...resultForm, test_name: e.target.value })} required placeholder={tr("testNamePlaceholder")} />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1">{tr("value")} *</label>
                          <input className="input input-light" type="number" step="0.01" value={resultForm.test_value} onChange={(e) => setResultForm({ ...resultForm, test_value: e.target.value })} required />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1">{tr("unit")}</label>
                          <input className="input input-light" value={resultForm.unit} onChange={(e) => setResultForm({ ...resultForm, unit: e.target.value })} placeholder={tr("unitPlaceholder")} />
                        </div>
                        <div className="md:col-span-4 flex justify-end gap-2 mt-2">
                          <button type="button" className="btn-ghost text-xs" onClick={() => setShowAddResult(false)}>{tr("cancel")}</button>
                          <button className="btn-primary text-xs" disabled={addingResult}>{addingResult ? tr("saving") : tr("saveResult")}</button>
                        </div>
                        {resultError && <p className="md:col-span-4 text-xs text-danger mt-1">{resultError}</p>}
                      </form>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-200 flex justify-end gap-3 no-print">
              <button className="btn-ghost" onClick={() => window.print()}>{tr("print")}</button>
              <button className="btn-primary" onClick={() => setViewModalOpen(false)}>{tr("close")}</button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

export default function LabsPage() {
  return <LabsPageContent />;
}
