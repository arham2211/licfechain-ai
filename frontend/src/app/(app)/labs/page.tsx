"use client";

import { useEffect, useRef, useState, FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { FlaskConical, Plus, X, Trash2, CheckCircle, Loader2, ImagePlus, RefreshCw, Pencil } from "lucide-react";
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
type SupportedTest = { test_name: string; unit?: string };
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

// One lab user per lab — user email matches lab email exactly.
function resolveLoggedInLab(
  user: ReturnType<typeof getUser>,
  labs: Lab[]
): Lab | null {
  const userEmail = (user?.email ?? "").toLowerCase();
  if (!userEmail) return null;
  return labs.find((l) => (l.email ?? "").toLowerCase() === userEmail) ?? null;
}

function resolveLoggedInLabId(user: ReturnType<typeof getUser>, labs: Lab[]): string {
  return resolveLoggedInLab(user, labs)?.lab_id ?? "";
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
  const canManageLabs = userRoles.includes("admin");

  const [labs, setLabs] = useState<Lab[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Create Lab
  const [showCreateLab, setShowCreateLab] = useState(false);
  const [labForm, setLabForm] = useState({ lab_name: "", lab_location: "", accreditation_number: "", phone: "", email: "", username: "", password: "" });
  const [creatingLab, setCreatingLab] = useState(false);
  const [labError, setLabError] = useState<string | null>(null);
  const [showEditLab, setShowEditLab] = useState(false);
  const [editingLab, setEditingLab] = useState<Lab | null>(null);
  const [editLabForm, setEditLabForm] = useState({ lab_name: "", lab_location: "", accreditation_number: "", phone: "", email: "" });
  const [savingLab, setSavingLab] = useState(false);
  const [editLabError, setEditLabError] = useState<string | null>(null);

  function generatePassword(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
    return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  }

  // Create Report
  const [showCreateReport, setShowCreateReport] = useState(false);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(false);
  const [patientsError, setPatientsError] = useState<string | null>(null);
  const [patientQuery, setPatientQuery] = useState("");
  const [labQuery, setLabQuery] = useState("");
  const [labSearch, setLabSearch] = useState("");
  const [showPatientOptions, setShowPatientOptions] = useState(false);
  const [showLabOptions, setShowLabOptions] = useState(false);
  const [reportForm, setReportForm] = useState({ patient_id: "", lab_id: "", visit_id: "", report_date: new Date().toISOString().slice(0, 16), report_type: "blood_test", status: "pending", test_name: "", performed_by: "" });
  const [patientVisits, setPatientVisits] = useState<VisitOption[]>([]);
  const [patientVisitsLoading, setPatientVisitsLoading] = useState(false);
  const [patientVisitsError, setPatientVisitsError] = useState<string | null>(null);
  const [creatingReport, setCreatingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [supportedTests, setSupportedTests] = useState<SupportedTest[]>([]);
  const [supportedTestsLoading, setSupportedTestsLoading] = useState(false);
  const [supportedTestsError, setSupportedTestsError] = useState<string | null>(null);
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

  // Patient name lookup (for doctor view)
  const [patientNameMap, setPatientNameMap] = useState<Record<string, string>>({});
  // Patient info lookup (name + CNIC) for lab view
  const [patientInfoMap, setPatientInfoMap] = useState<Record<string, { name: string; cnic: string }>>({}); 
  const [labReportSearch, setLabReportSearch] = useState("");

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

  async function fetchSupportedTests() {
    setSupportedTestsLoading(true);
    setSupportedTestsError(null);
    try {
      const response = await api.request<{ supported_tests?: SupportedTest[] } | SupportedTest[]>(
        "/labs/tests/supported"
      );
      const list = Array.isArray(response) ? response : (response.supported_tests ?? []);
      const uniqueSorted = [...new Map(list.map((t) => [t.test_name, t])).values()].sort((a, b) =>
        a.test_name.localeCompare(b.test_name)
      );
      setSupportedTests(uniqueSorted);
    } catch (e) {
      setSupportedTests([]);
      setSupportedTestsError(e instanceof Error ? e.message : tr("failed"));
    } finally {
      setSupportedTestsLoading(false);
    }
  }

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
      const directLabId = isLabOnlySession ? resolveLoggedInLabId(user, loadedLabs) : "";

      const isDoctor = userRoles.includes("doctor");
      const effectivePatientId = patientId || (isPatient ? (user?.patient_id || "") : "");
      const reportQueryParts = [`skip=0`, `limit=1000`];
      if (effectivePatientId) reportQueryParts.push(`patient_id=${encodeURIComponent(effectivePatientId)}`);
      if (directLabId) reportQueryParts.push(`lab_id=${encodeURIComponent(directLabId)}`);
      // For doctors without a specific patient selected, filter server-side by their visits
      if (isDoctor && user?.patient_id && !effectivePatientId) {
        reportQueryParts.push(`doctor_patient_id=${encodeURIComponent(user.patient_id)}`);
      }
      if (reportStatusFilter !== "all") reportQueryParts.push(`status=${encodeURIComponent(reportStatusFilter)}`);
      const reportsUrl = `/labs/reports?${reportQueryParts.join("&")}`;

      let r = await api.request<Report[]>(reportsUrl);
      if (requestId !== loadAllRequestId.current) return;

      // For doctors: build patient name map from the returned reports
      if (isDoctor && user?.patient_id && !effectivePatientId) {
        const doctorPatientIds = new Set(r.map((rep) => rep.patient_id));
        const nameMap: Record<string, string> = {};
        await Promise.all(
          Array.from(doctorPatientIds).map(async (pid) => {
            try {
              const p = await api.request<{ first_name: string; last_name: string }>(`/patients/${pid}`);
              nameMap[pid] = `${p.first_name} ${p.last_name}`;
            } catch { nameMap[pid] = pid.slice(0, 8); }
          })
        );
        if (requestId !== loadAllRequestId.current) return;
        setPatientNameMap(nameMap);
      }

      // For lab users: build patient info map (name + CNIC) for all reports
      if (isLabOnlySession && r.length > 0) {
        try {
          const labPatientIds = Array.from(new Set(r.map((rep) => rep.patient_id)));
          const infoMap: Record<string, { name: string; cnic: string }> = {};
          await Promise.all(
            labPatientIds.map(async (pid) => {
              try {
                const p = await api.request<{ first_name: string; last_name: string; cnic: string }>(`/patients/${pid}`);
                infoMap[pid] = { name: `${p.first_name} ${p.last_name}`, cnic: p.cnic ?? "" };
              } catch { infoMap[pid] = { name: pid.slice(0, 8), cnic: "" }; }
            })
          );
          if (requestId !== loadAllRequestId.current) return;
          setPatientInfoMap(infoMap);
        } catch { /* silently fail */ }
      }

      setReports(r);
    } catch (e) {
      if (requestId !== loadAllRequestId.current) return;
      setError(e instanceof Error ? e.message : tr("failedToLoadLabs"));
    }
  }

  async function handleCreateLab(e: FormEvent) {
    e.preventDefault(); setLabError(null); setCreatingLab(true);
    let createdLabId: string | null = null;
    try {
      if (!labForm.email) throw new Error("Email is required to create a lab login account");
      if (!labForm.username) throw new Error("Username is required");
      if (!labForm.password || labForm.password.length < 8) throw new Error("Password must be at least 8 characters");
      const createdLab = await api.request<{ lab_id: string }>("/labs/", {
        method: "POST", body: JSON.stringify({
          lab_name: labForm.lab_name, lab_location: labForm.lab_location || null,
          accreditation_number: labForm.accreditation_number || null, phone: labForm.phone || null, email: labForm.email || null,
        })
      });
      createdLabId = createdLab.lab_id;
      // Create login account for the lab
      await api.request("/auth/register", {
        method: "POST",
        body: JSON.stringify({ username: labForm.username, email: labForm.email, password: labForm.password, role: "lab" }),
      });
      // Email credentials to admin
      await api.request("/auth/send-credentials", {
        method: "POST",
        body: JSON.stringify({ name: labForm.lab_name, email: labForm.email, username: labForm.username, password: labForm.password, role: "lab" }),
      }).catch(() => {}); // non-blocking
      setShowCreateLab(false); setLabForm({ lab_name: "", lab_location: "", accreditation_number: "", phone: "", email: "", username: "", password: "" });
      setSuccessMsg(tr("labCreated") + " — credentials emailed"); setTimeout(() => setSuccessMsg(null), 4000); await loadAll();
    } catch (e) {
      if (createdLabId) {
        await api.request(`/labs/${createdLabId}`, { method: "DELETE" }).catch(() => {});
      }
      setLabError(e instanceof Error ? e.message : tr("failedToCreateLab"));
    } finally { setCreatingLab(false); }
  }

  function openEditLab(lab: Lab) {
    setEditingLab(lab);
    setEditLabForm({
      lab_name: lab.lab_name,
      lab_location: lab.lab_location ?? "",
      accreditation_number: lab.accreditation_number ?? "",
      phone: lab.phone ?? "",
      email: lab.email ?? "",
    });
    setEditLabError(null);
    setShowEditLab(true);
  }

  async function handleSaveLab(e: FormEvent) {
    e.preventDefault();
    if (!editingLab) return;
    setEditLabError(null);
    setSavingLab(true);
    try {
      await api.request(`/labs/${editingLab.lab_id}`, {
        method: "PUT",
        body: JSON.stringify({
          lab_name: editLabForm.lab_name,
          lab_location: editLabForm.lab_location || null,
          accreditation_number: editLabForm.accreditation_number || null,
          phone: editLabForm.phone || null,
          email: editLabForm.email || null,
        }),
      });
      setShowEditLab(false);
      setEditingLab(null);
      setSuccessMsg("Lab updated successfully");
      setTimeout(() => setSuccessMsg(null), 3000);
      await loadAll();
    } catch (e) {
      setEditLabError(e instanceof Error ? e.message : tr("failed"));
    } finally {
      setSavingLab(false);
    }
  }

  function openCreateReport() {
    const defaultLabId = userRoles.includes("lab")
      ? (resolveLoggedInLab(user, labs)?.lab_id ?? "")
      : "";
    const defaultLabName = userRoles.includes("lab")
      ? (resolveLoggedInLab(user, labs)?.lab_name ?? user?.username ?? "")
      : "";
    setShowCreateReport(true);
    setPatientQuery("");
    setLabQuery(defaultLabName);
    setReportForm((prev) => ({ ...prev, patient_id: "", lab_id: defaultLabId, visit_id: "" }));
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
    const defaultLabId = userRoles.includes("lab")
      ? (resolveLoggedInLab(user, labs)?.lab_id ?? "")
      : "";
    const defaultLabName = userRoles.includes("lab")
      ? (resolveLoggedInLab(user, labs)?.lab_name ?? user?.username ?? "")
      : "";
    setShowOralScan(true);
    setOralScanError(null);
    setOralPatientQuery("");
    setOralLabQuery(defaultLabName);
    setOralScanForm({
      patient_id: "",
      lab_id: defaultLabId,
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
    if (!showCreateReport) return;
    void fetchSupportedTests();
  }, [showCreateReport, language, tr]);

  useEffect(() => {
    if (!showAddResult) return;
    if (supportedTests.length > 0) return;
    void fetchSupportedTests();
  }, [showAddResult]);

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

  const filteredLabsMain = labSearch.trim()
    ? labs.filter((l) => l.lab_name.toLowerCase().includes(labSearch.trim().toLowerCase()))
    : labs;

  const isLabOnlyView = userRoles.includes("lab") && !userRoles.includes("admin") && !userRoles.includes("doctor");
  const loggedInLab = userRoles.includes("lab") ? resolveLoggedInLab(user, labs) : null;
  const filteredReports = reports.filter((r) => {
    if (reportStatusFilter !== "all" && r.status !== reportStatusFilter) return false;
    if (isLabOnlyView && labReportSearch.trim()) {
      const q = labReportSearch.trim().toLowerCase();
      const info = patientInfoMap[r.patient_id];
      const name = info?.name.toLowerCase() ?? "";
      const cnic = info?.cnic.toLowerCase() ?? "";
      if (!name.includes(q) && !cnic.includes(q)) return false;
    }
    return true;
  });
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

  function handleResultTestChange(testName: string) {
    const selectedTest = supportedTests.find((test) => test.test_name === testName);
    setResultForm((prev) => ({
      ...prev,
      test_name: testName,
      unit: selectedTest?.unit ?? "",
    }));
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
        title={
          isPatient
            ? tr("myLabReports")
            : userRoles.includes("doctor")
            ? "Lab Reports"
            : userRoles.includes("lab") && showReportsSection
            ? "Reports"
            : userRoles.includes("lab") && showLabsSection
            ? "Labs"
            : "Labs"
        }
        subtitle={
          isPatient
            ? tr("myLabReportsSubtitle")
            : userRoles.includes("lab") && showReportsSection
            ? "Manage and view all reports."
            : userRoles.includes("lab") && showLabsSection
            ? "Manage and view all labs."
            : tr("labsAndReportsSubtitle")
        }
        icon={<FlaskConical size={20} />}
        right={
          <div className="flex flex-col md:flex-row items-end md:items-center gap-4">
            {!isPatient && userRoles.includes("lab") && (
              <div className="flex items-center gap-2 overflow-visible relative z-40">
                {showLabsSection && (
                  <input
                    className="input w-64"
                    placeholder="Search labs by name"
                    value={labSearch}
                    onChange={e => setLabSearch(e.target.value)}
                  />
                )}
                {showReportsSection && (
                  <>
                    <input
                      className="input w-64"
                      placeholder="Search reports by patient / CNIC"
                      value={labReportSearch}
                      onChange={e => setLabReportSearch(e.target.value)}
                    />
                    <button className="btn-primary text-sm whitespace-nowrap" onClick={openCreateReport}>
                      <Plus size={16} /> {tr("newReport")}
                    </button>
                    <button className="btn-primary text-sm whitespace-nowrap" onClick={openOralScanModal}>
                      <ImagePlus size={16} /> Oral Scan
                    </button>
                  </>
                )}
              </div>
            )}
            {!isPatient && !userRoles.includes("lab") && (
              <div className="flex items-center gap-2 overflow-visible relative z-40">
                <PatientSearch onSelect={setPatientId} className="w-64" />
                {showLabsSection && canCreateLab && <button className="btn-primary text-sm whitespace-nowrap" onClick={() => { setLabForm({ lab_name: "", lab_location: "", accreditation_number: "", phone: "", email: "", username: "", password: generatePassword() }); setLabError(null); setShowCreateLab(true); }}><Plus size={16} /> {tr("newLab")}</button>}
              </div>
            )}
          </div>
        }
      />

      {error && <div className="card p-4 text-sm text-danger">{error}</div>}
      {successMsg && <div className="alert-success">{successMsg}</div>}

      {/* Edit Lab Modal */}
      {showEditLab && editingLab && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(15,23,42,0.45)", backdropFilter: "blur(4px)" }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.22 }}
            className="w-full max-w-lg rounded-2xl border border-primary/10 shadow-2xl"
            style={{ background: "rgba(255,255,255,0.97)", backdropFilter: "blur(20px)" }}
          >
            <div className="flex items-center justify-between border-b border-primary/10 px-6 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-r from-blue-600 to-cyan-500 shadow-md shadow-primary/20">
                  <Pencil size={16} className="text-white" />
                </div>
                <h2 className="text-base font-semibold text-slate-800">Edit Lab</h2>
              </div>
              <button
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                onClick={() => setShowEditLab(false)}
              >
                <X size={16} />
              </button>
            </div>

            <form className="space-y-4 px-6 py-5" onSubmit={handleSaveLab}>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">{tr("labName")} <span className="text-primary">*</span></label>
                <input
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 shadow-sm transition focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15"
                  value={editLabForm.lab_name}
                  onChange={(e) => setEditLabForm({ ...editLabForm, lab_name: e.target.value })}
                  required
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">{tr("location")}</label>
                  <input
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 shadow-sm transition focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15"
                    value={editLabForm.lab_location}
                    onChange={(e) => setEditLabForm({ ...editLabForm, lab_location: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">{tr("accreditation")}</label>
                  <input
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 shadow-sm transition focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15"
                    value={editLabForm.accreditation_number}
                    onChange={(e) => setEditLabForm({ ...editLabForm, accreditation_number: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">{tr("phone")}</label>
                  <input
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 shadow-sm transition focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15"
                    value={editLabForm.phone}
                    onChange={(e) => setEditLabForm({ ...editLabForm, phone: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">{tr("email")}</label>
                  <input
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 shadow-sm transition focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15"
                    type="email"
                    value={editLabForm.email}
                    onChange={(e) => setEditLabForm({ ...editLabForm, email: e.target.value })}
                  />
                </div>
              </div>

              {editLabError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{editLabError}</div>}

              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:border-slate-300"
                  onClick={() => setShowEditLab(false)}
                >
                  {tr("cancel")}
                </button>
                <button className="btn-primary" disabled={savingLab}>
                  {savingLab ? tr("saving") : "Save Changes"}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Create Lab Modal */}
      {showCreateLab && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(15,23,42,0.45)", backdropFilter: "blur(4px)" }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.22 }}
            className="w-full max-w-lg rounded-2xl border border-primary/10 shadow-2xl"
            style={{ background: "rgba(255,255,255,0.97)", backdropFilter: "blur(20px)" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-primary/10 px-6 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-r from-blue-600 to-cyan-500 shadow-md shadow-primary/20">
                  <FlaskConical size={16} className="text-white" />
                </div>
                <h2 className="text-base font-semibold text-slate-800">{tr("createLab")}</h2>
              </div>
              <button
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                onClick={() => setShowCreateLab(false)}
              >
                <X size={16} />
              </button>
            </div>

            <form className="space-y-4 px-6 py-5" onSubmit={handleCreateLab}>
              {/* Lab Name */}
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">{tr("labName")} <span className="text-primary">*</span></label>
                <input
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 shadow-sm transition focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15"
                  value={labForm.lab_name}
                  onChange={(e) => setLabForm({ ...labForm, lab_name: e.target.value })}
                  required
                  placeholder="e.g., Chughtai Lab"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">{tr("location")}</label>
                  <input
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 shadow-sm transition focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15"
                    value={labForm.lab_location}
                    onChange={(e) => setLabForm({ ...labForm, lab_location: e.target.value })}
                    placeholder="e.g., Lahore, Pakistan"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">{tr("accreditation")}</label>
                  <input
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 shadow-sm transition focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15"
                    value={labForm.accreditation_number}
                    onChange={(e) => setLabForm({ ...labForm, accreditation_number: e.target.value })}
                    placeholder="e.g., PAL-0001"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">{tr("phone")}</label>
                  <input
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 shadow-sm transition focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15"
                    value={labForm.phone}
                    onChange={(e) => setLabForm({ ...labForm, phone: e.target.value })}
                    placeholder="+92 300 0000000"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">{tr("email")} <span className="text-primary">*</span></label>
                  <input
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 shadow-sm transition focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15"
                    type="email"
                    value={labForm.email}
                    onChange={(e) => setLabForm({ ...labForm, email: e.target.value, username: e.target.value.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "") })}
                    required
                    placeholder="lab@example.com"
                  />
                </div>
              </div>

              {/* Login Credentials */}
              <div className="border-t border-slate-100 pt-2">
                <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">Login Credentials</p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-slate-700">Username <span className="text-primary">*</span></label>
                    <input
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 shadow-sm transition focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15"
                      value={labForm.username}
                      onChange={(e) => setLabForm({ ...labForm, username: e.target.value })}
                      required
                      placeholder="e.g., chughtailab"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-slate-700">Password <span className="text-primary">*</span></label>
                    <div className="flex gap-2">
                      <input
                        className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-mono text-slate-800 shadow-sm transition focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15"
                        type="text"
                        value={labForm.password}
                        onChange={(e) => setLabForm({ ...labForm, password: e.target.value })}
                        required
                        minLength={8}
                        placeholder="Min 8 characters"
                      />
                      <button
                        type="button"
                        title="Generate random password"
                        className="flex items-center gap-1 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs font-semibold text-primary transition hover:bg-primary/10"
                        onClick={() => setLabForm({ ...labForm, password: generatePassword() })}
                      >
                        <RefreshCw size={13} />
                        Gen
                      </button>
                    </div>
                  </div>
                </div>
                <p className="mt-1.5 text-xs text-slate-400">Credentials will be emailed to the admin after creation.</p>
              </div>

              {labError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{labError}</div>
              )}

              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:border-slate-300"
                  onClick={() => setShowCreateLab(false)}
                >
                  {tr("cancel")}
                </button>
                <button className="btn-primary" disabled={creatingLab}>
                  {creatingLab ? tr("creating") : tr("createLab")}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Create Report Modal */}
      {showCreateReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(15,23,42,0.45)", backdropFilter: "blur(4px)" }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.22 }}
            className="w-full max-w-2xl rounded-2xl border border-primary/10 shadow-2xl"
            style={{ background: "rgba(255,255,255,0.97)", backdropFilter: "blur(20px)" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-primary/10 px-6 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-r from-blue-600 to-cyan-500 shadow-md shadow-primary/20">
                  <FlaskConical size={16} className="text-white" />
                </div>
                <h2 className="text-base font-semibold text-slate-800">{tr("createLabReport")}</h2>
              </div>
              <button
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                onClick={() => setShowCreateReport(false)}
              >
                <X size={16} />
              </button>
            </div>

            <form className="max-h-[80vh] space-y-4 overflow-y-auto px-6 py-5" onSubmit={handleCreateReport}>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {/* Patient */}
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">{tr("patient")} <span className="text-primary">*</span></label>
                  <div className="relative">
                    <input
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 shadow-sm transition focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15"
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
                      <div className="absolute left-0 right-0 top-full z-[12000] mt-2 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-2xl">
                        {filteredPatients.length > 0 ? filteredPatients.map((p) => (
                          <button
                            key={p.patient_id}
                            type="button"
                            className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 transition"
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
                  {patientsError && <p className="mt-1 text-xs text-red-500">{patientsError}</p>}
                </div>

                {/* Lab */}
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">{tr("lab")} <span className="text-primary">*</span></label>
                  {isLabOnlyView ? (
                    <input
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-700 shadow-sm"
                      value={loggedInLab?.lab_name ?? labQuery ?? user?.username ?? ""}
                      readOnly
                    />
                  ) : (
                    <div className="relative">
                      <input
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 shadow-sm transition focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15"
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
                        <div className="absolute left-0 right-0 top-full z-[12000] mt-2 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-2xl">
                          {filteredLabs.length > 0 ? filteredLabs.map((l) => (
                            <button
                              key={l.lab_id}
                              type="button"
                              className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 transition"
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
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {/* Report Type */}
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">{tr("reportType")} <span className="text-primary">*</span></label>
                  <select
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm transition focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15"
                    value={reportForm.report_type}
                    onChange={(e) => setReportForm({ ...reportForm, report_type: e.target.value })}
                    required
                  >
                    {REPORT_TYPE_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option.replace(/_/g, " ")}</option>
                    ))}
                  </select>
                </div>

                {/* Status */}
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">{tr("status")}</label>
                  <select
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm transition focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15"
                    value={reportForm.status}
                    onChange={(e) => setReportForm({ ...reportForm, status: e.target.value })}
                  >
                    <option value="pending">{tr("pending")}</option>
                    <option value="completed">{tr("completed")}</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {/* Linked Visit */}
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">Linked Visit <span className="text-slate-400 font-normal">(Optional)</span></label>
                  <select
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm transition focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15 disabled:opacity-50"
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
                  {patientVisitsError && <p className="mt-1 text-xs text-red-500">{patientVisitsError}</p>}
                </div>

                {/* Date */}
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">{tr("date")} <span className="text-primary">*</span></label>
                  <input
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 shadow-sm transition focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15"
                    type="datetime-local"
                    value={reportForm.report_date}
                    onChange={(e) => setReportForm({ ...reportForm, report_date: e.target.value })}
                    required
                  />
                </div>


              </div>

              {/* Performed By */}
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">{tr("performedBy")}</label>
                <input
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 shadow-sm transition focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15"
                  value={reportForm.performed_by}
                  onChange={(e) => setReportForm({ ...reportForm, performed_by: e.target.value })}
                  placeholder={tr("performedByPlaceholder")}
                />
              </div>

              {reportError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{reportError}</div>
              )}

              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:border-slate-300"
                  onClick={() => setShowCreateReport(false)}
                >
                  {tr("cancel")}
                </button>
                <button className="btn-primary" disabled={creatingReport}>
                  {creatingReport ? tr("creating") : tr("createReport")}
                </button>
              </div>
            </form>
          </motion.div>
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
            <thead className="table-header"><tr><th className="px-4 py-3 text-left">{tr("type")}</th><th className="px-4 py-3 text-left">{tr("status")}</th><th className="px-4 py-3 text-left">{tr("date")}</th><th className="px-4 py-3 text-left">{tr("laboratory")}</th></tr></thead>
            <tbody>
              {filteredReports.map((r) => (
                <tr key={r.report_id} className={`table-row cursor-pointer transition ${viewingReport?.report_id === r.report_id ? "bg-primary/5" : "hover:bg-primary/5"}`} onClick={() => selectReport(r)}>
                  <td className="px-4 py-3 capitalize">{r.report_type.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3"><span className={`badge ${r.status === "completed" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>{tr(r.status)}</span></td>
                  <td className="px-4 py-3">{String(r.report_date).slice(0, 10)}</td>
                  <td className="px-4 py-3">{labs.find((l) => l.lab_id === r.lab_id)?.lab_name ?? "-"}</td>
                </tr>
              ))}
              {filteredReports.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted">{tr("noLabReportsFound")}</td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        /* Admin/Doctor/Lab view: Labs + Reports (stacked, full width) */
        <div className="flex flex-col gap-4">
          {/* Show Labs section for all except doctors */}
          {showLabsSection && !userRoles.includes("doctor") && (
            <div className="card overflow-x-auto p-0">
              <div className="border-b border-border px-4 py-3 font-bold text-lg text-slate-800 tracking-wide bg-gradient-to-r from-primary/10 to-cyan-50">Labs ({filteredLabsMain.length})</div>
              <table className="w-full min-w-[400px] text-sm">
                <thead className="table-header"><tr><th className="px-4 py-3 text-left">{tr("name")}</th><th className="px-4 py-3 text-left">{tr("location")}</th><th className="px-4 py-3 text-left">{tr("accreditationShort")}</th>{canManageLabs && <th className="px-4 py-3 text-left">Actions</th>}</tr></thead>
                <tbody>
                  {filteredLabsMain.map((lab) => (
                    <tr key={lab.lab_id} className="table-row">
                      <td className="px-4 py-3 font-medium">{lab.lab_name}</td>
                      <td className="px-4 py-3">{lab.lab_location ?? "-"}</td>
                      <td className="px-4 py-3">{lab.accreditation_number ?? "-"}</td>
                      {canManageLabs && (
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className="rounded-lg bg-primary/10 p-2 text-primary transition hover:bg-primary/20"
                              title="Edit Lab"
                              onClick={() => openEditLab(lab)}
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              className="rounded-lg bg-danger/10 p-2 text-danger transition hover:bg-danger/20"
                              title="Delete Lab"
                              onClick={() => handleDeleteLab(lab.lab_id)}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                  {filteredLabsMain.length === 0 && <tr><td colSpan={canManageLabs ? 4 : 3} className="px-4 py-8 text-center text-muted">No labs found</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Doctor view: all reports for patients who visited them */}
      {userRoles.includes("doctor") && !isPatient && !patientId && (
        <div className="card p-0 overflow-x-auto overflow-visible relative">
          <div className="flex flex-col gap-3 border-b border-border px-5 py-3 md:flex-row md:items-center md:justify-between">
            <div className="font-semibold gradient-text">
              Patient Lab Reports ({filteredReports.length})
            </div>
            <div className="flex items-center gap-3">
              <input
                className="w-56 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 transition focus:border-primary/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="Search patient or type..."
                value={labReportSearch}
                onChange={(e) => setLabReportSearch(e.target.value)}
              />
              <div className="inline-flex items-center gap-1 rounded-full border border-border bg-slate-100/40 p-1">
                <button type="button" onClick={() => setReportStatusFilter("all")}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${reportStatusFilter === "all" ? "bg-white text-primary shadow-sm" : "text-muted hover:text-foreground"}`}>
                  All
                </button>
                <button type="button" onClick={() => setReportStatusFilter("pending")}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${reportStatusFilter === "pending" ? "bg-warning/20 text-warning" : "text-muted hover:text-foreground"}`}>
                  Pending
                </button>
                <button type="button" onClick={() => setReportStatusFilter("completed")}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${reportStatusFilter === "completed" ? "bg-success/20 text-success" : "text-muted hover:text-foreground"}`}>
                  Completed
                </button>
              </div>
            </div>
          </div>
          <table className="w-full min-w-150 text-sm">
            <thead className="table-header">
              <tr>
                <th className="px-4 py-3 text-left">Patient</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Laboratory</th>
              </tr>
            </thead>
            <tbody>
              {filteredReports
                .filter((r) => {
                  if (!labReportSearch.trim()) return true;
                  const q = labReportSearch.trim().toLowerCase();
                  const pName = (patientNameMap[r.patient_id] ?? "").toLowerCase();
                  const rType = r.report_type.replace(/_/g, " ").toLowerCase();
                  return pName.includes(q) || rType.includes(q);
                })
                .map((r) => (
                  <tr key={r.report_id}
                    className={`table-row cursor-pointer transition ${viewingReport?.report_id === r.report_id ? "bg-primary/5" : "hover:bg-primary/5"}`}
                    onClick={() => selectReport(r)}>
                    <td className="px-4 py-3 font-medium">{patientNameMap[r.patient_id] ?? r.patient_id.slice(0, 8)}</td>
                    <td className="px-4 py-3 capitalize">{r.report_type.replace(/_/g, " ")}</td>
                    <td className="px-4 py-3">
                      <span className={`badge ${r.status === "completed" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">{String(r.report_date).slice(0, 10)}</td>
                    <td className="px-4 py-3">{labs.find((l) => l.lab_id === r.lab_id)?.lab_name ?? "-"}</td>
                  </tr>
                ))}
              {filteredReports.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">No lab reports found for your patients.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Professional View Report Modal */}
      {viewModalOpen && viewingReport && (
        <div className="modal-overlay z-[100] p-4 flex items-center justify-center overflow-hidden">
          <div className="bg-white text-slate-900 w-full max-w-4xl max-h-[95vh] rounded-xl shadow-2xl flex flex-col relative overflow-hidden print:shadow-none print:m-0 print:max-h-none">

            {/* Move close button higher and further right to avoid overlap */}
            <button className="absolute top-2 right-2 z-20 p-2 hover:bg-slate-100 rounded-full transition no-print" onClick={() => setViewModalOpen(false)}>
              <X size={20} className="text-slate-500" />
            </button>

            <div className="flex-1 overflow-y-auto">
              {/* Increase top padding to fully clear the close button and its hover effect */}
              <div className="pt-14 p-8 border-b-4 border-primary bg-slate-50 flex flex-col md:flex-row justify-between items-start gap-6">
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
                  {patientNameMap[viewingReport.patient_id] && (
                    <p className="text-sm text-slate-700 font-semibold">Patient: {patientNameMap[viewingReport.patient_id]}</p>
                  )}
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
                          <select
                            className="input input-light"
                            value={resultForm.test_name}
                            onChange={(e) => handleResultTestChange(e.target.value)}
                            required
                          >
                            <option value="">{supportedTestsLoading ? tr("loading") : tr("selectOption")}</option>
                            {supportedTests.map((test) => (
                              <option key={test.test_name} value={test.test_name}>
                                {test.test_name.replace(/_/g, " ")}
                              </option>
                            ))}
                          </select>
                          {supportedTestsError && <p className="mt-1 text-xs text-danger">{supportedTestsError}</p>}
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1">{tr("value")} *</label>
                          <input className="input input-light" type="number" step="0.01" value={resultForm.test_value} onChange={(e) => setResultForm({ ...resultForm, test_value: e.target.value })} required />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1">{tr("unit")}</label>
                          <input className="input input-light bg-slate-50 text-slate-600" value={resultForm.unit} readOnly placeholder={tr("unitPlaceholder")} />
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
