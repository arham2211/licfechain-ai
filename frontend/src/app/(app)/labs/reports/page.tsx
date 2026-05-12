"use client";

import { useEffect, useRef, useState, FormEvent } from "react";
import { motion } from "framer-motion";
import { FileText, CheckCircle, Trash2, Search, Plus, X, FlaskConical, Pencil, ScanLine } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api-client";
import { getUser } from "@/lib/auth-store";

type Report = {
  report_id: string;
  patient_id: string;
  lab_id: string;
  report_type: string;
  status: string;
  report_date: string;
  test_name?: string;
  performed_by?: string;
};
type Lab = { lab_id: string; lab_name: string; lab_location?: string; accreditation_number?: string };
type PatientOption = { patient_id: string; first_name: string; last_name: string; cnic: string };
type VisitOption = { visit_id: string; visit_date: string; visit_type: string; chief_complaint?: string | null };
type TestResult = { result_id: string; test_name: string; test_value: number; unit?: string; reference_range_min?: number; reference_range_max?: number; is_abnormal?: boolean };
type SupportedTest = { test_name: string; unit?: string };

const REPORT_TYPE_OPTIONS = ["blood_test","urine_test","cbc","kidney_panel","thyroid_panel","parathyroid_panel","oral_cancer_screening","comprehensive_panel"];

export default function PatientReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [labs, setLabs] = useState<Lab[]>([]);
  const [patientNameMap, setPatientNameMap] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "completed">("all");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const loadRef = useRef(0);

  // View modal
  const [viewingReport, setViewingReport] = useState<Report | null>(null);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  // Add test result
  const [showAddResult, setShowAddResult] = useState(false);
  const [resultForm, setResultForm] = useState({ test_name: "", test_value: "", unit: "" });
  const [supportedTests, setSupportedTests] = useState<SupportedTest[]>([]);
  const [addingResult, setAddingResult] = useState(false);
  const [resultError, setResultError] = useState<string | null>(null);

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [patientQuery, setPatientQuery] = useState("");
  const [showPatientOptions, setShowPatientOptions] = useState(false);
  const [patientsLoading, setPatientsLoading] = useState(false);
  const [labQuery, setLabQuery] = useState("");
  const [showLabOptions, setShowLabOptions] = useState(false);
  const [patientVisits, setPatientVisits] = useState<VisitOption[]>([]);
  const [patientVisitsLoading, setPatientVisitsLoading] = useState(false);
  const [reportForm, setReportForm] = useState({ patient_id: "", lab_id: "", visit_id: "", report_date: new Date().toISOString().slice(0, 16), report_type: "blood_test", status: "pending", test_name: "", performed_by: "" });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const patientSearchRef = useRef(0);

  // Edit Report modal
  const [showEditReport, setShowEditReport] = useState(false);
  const [editReportTarget, setEditReportTarget] = useState<Report | null>(null);
  const [editReportForm, setEditReportForm] = useState({ report_type: "blood_test", status: "pending", report_date: "", performed_by: "", test_name: "" });
  const [savingReport, setSavingReport] = useState(false);
  const [editReportError, setEditReportError] = useState<string | null>(null);

  // Oral Scan
  const [showOralScan, setShowOralScan] = useState(false);
  const [oralScanFile, setOralScanFile] = useState<File | null>(null);
  const [oralScanLoading, setOralScanLoading] = useState(false);
  const [oralScanResult, setOralScanResult] = useState<{ diagnosis_label: string; progression_stage: string; confidence_score: number } | null>(null);
  const [oralScanError, setOralScanError] = useState<string | null>(null);

  // Edit test result inline
  const [editingResultId, setEditingResultId] = useState<string | null>(null);
  const [editResultForm, setEditResultForm] = useState({ test_value: "", unit: "" });
  const [savingResult, setSavingResult] = useState(false);
  const [editResultError, setEditResultError] = useState<string | null>(null);

  // Role & lab identity
  const currentUser = getUser();
  const isLabRole = currentUser?.roles.includes("lab") && !currentUser?.roles.includes("admin");
  const [myLabId, setMyLabId] = useState<string | null>(null);

  // Resolve the lab_id for the logged-in lab user
  useEffect(() => {
    if (!isLabRole) return;
    api.request<(Lab & { email?: string })[]>("/labs/?skip=0&limit=200")
      .then((all) => {
        const email = (currentUser?.email ?? "").toLowerCase();
        const match = all.find((l) => (l.email ?? "").toLowerCase() === email);
        if (match) setMyLabId(match.lab_id);
        else setMyLabId(""); // no match — unblock load
      })
      .catch(() => setMyLabId("")); // error — unblock load
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLabRole]);

  async function load() {
    // For lab role: wait until we know our lab_id (or confirmed no match)
    if (isLabRole && myLabId === null) return;
    const id = ++loadRef.current;
    try {
      const statusParam = statusFilter !== "all" ? `&status=${statusFilter}` : "";
      const reportUrl = isLabRole && myLabId
        ? `/labs/reports?skip=0&limit=1000&lab_id=${encodeURIComponent(myLabId)}${statusParam}`
        : `/labs/reports?skip=0&limit=1000${statusParam}`;

      const [labData, reportData] = await Promise.all([
        isLabRole && myLabId
          ? api.request<Lab>(`/labs/${myLabId}`).then((l) => [l])
          : api.request<Lab[]>("/labs/?skip=0&limit=200"),
        api.request<Report[]>(reportUrl),
      ]) as [Lab[], Report[]];
      if (id !== loadRef.current) return;
      setLabs(labData);
      const uniqueIds = [...new Set(reportData.map((r) => r.patient_id))];
      const nameMap: Record<string, string> = {};
      await Promise.allSettled(
        uniqueIds.map((pid) =>
          api.request<{ first_name: string; last_name: string }>(`/patients/${pid}`)
            .then((p) => { nameMap[pid] = `${p.first_name} ${p.last_name}`; })
            .catch(() => { nameMap[pid] = pid.slice(0, 8); })
        )
      );
      if (id !== loadRef.current) return;
      setPatientNameMap(nameMap);
      setReports(reportData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load reports");
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [statusFilter, myLabId, isLabRole]);

  async function selectReport(report: Report) {
    setViewingReport(report);
    setViewModalOpen(true);
    setShowAddResult(false);
    setShowOralScan(false); setOralScanFile(null); setOralScanResult(null); setOralScanError(null);
    try {
      const data = await api.request<TestResult[]>(`/labs/reports/${report.report_id}/test-results`);
      setTestResults(data);
    } catch { setTestResults([]); }
    // load supported tests for add result
    if (supportedTests.length === 0) {
      try {
        const res = await api.request<{ supported_tests?: SupportedTest[] } | SupportedTest[]>("/labs/tests/supported");
        const list = Array.isArray(res) ? res : (res.supported_tests ?? []);
        setSupportedTests([...new Map(list.map((t) => [t.test_name, t])).values()].sort((a, b) => a.test_name.localeCompare(b.test_name)));
      } catch { /* silent */ }
    }
  }

  async function handleAddResult(e: FormEvent) {
    e.preventDefault();
    if (!viewingReport) return;
    setResultError(null); setAddingResult(true);
    try {
      await api.request(`/labs/reports/${viewingReport.report_id}/test-results`, {
        method: "POST",
        body: JSON.stringify({ test_name: resultForm.test_name, test_value: parseFloat(resultForm.test_value), unit: resultForm.unit || null }),
      });
      setShowAddResult(false); setResultForm({ test_name: "", test_value: "", unit: "" });
      setSuccessMsg("Test result added"); setTimeout(() => setSuccessMsg(null), 3000);
      await selectReport(viewingReport);
    } catch (e) { setResultError(e instanceof Error ? e.message : "Failed to add result"); } finally { setAddingResult(false); }
  }

  async function handleOralScan(e: FormEvent) {
    e.preventDefault();
    if (!viewingReport || !oralScanFile) return;
    setOralScanError(null); setOralScanResult(null); setOralScanLoading(true);
    try {
      const formData = new FormData();
      formData.append("patient_id", viewingReport.patient_id);
      formData.append("image", oralScanFile);
      if (viewingReport.lab_id) formData.append("lab_id", viewingReport.lab_id);
      formData.append("report_id", viewingReport.report_id);
      formData.append("auto_save", "true");
      const result = await api.request<{ diagnosis_label: string; progression_stage: string; confidence_score: number }>(
        "/ml/oral-cancer/detect",
        { method: "POST", body: formData }
      );
      setOralScanResult(result);
      // Insert into Diagnostic Results table
      await api.request(`/labs/reports/${viewingReport.report_id}/test-results`, {
        method: "POST",
        body: JSON.stringify({
          test_name: `Oral Cancer (${result.diagnosis_label})`,
          test_value: Math.round(result.confidence_score * 1000) / 10,
          unit: "% confidence",
        }),
      });
      const updated = await api.request<TestResult[]>(`/labs/reports/${viewingReport.report_id}/test-results`);
      setTestResults(updated);
      setSuccessMsg("Oral scan analysed successfully"); setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      setOralScanError(err instanceof Error ? err.message : "Oral scan failed");
    } finally {
      setOralScanLoading(false);
    }
  }

  async function handleDelete(reportId: string) {
    if (!confirm("Delete this report? This cannot be undone.")) return;
    try {
      await api.request(`/labs/reports/${reportId}`, { method: "DELETE" });
      if (viewingReport?.report_id === reportId) { setViewModalOpen(false); setViewingReport(null); }
      setSuccessMsg("Report deleted"); setTimeout(() => setSuccessMsg(null), 3000);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to delete report"); }
  }

  async function handleMarkCompleted(reportId: string) {
    try {
      await api.request(`/labs/reports/${reportId}`, { method: "PUT", body: JSON.stringify({ status: "completed" }) });
      if (viewingReport?.report_id === reportId) setViewingReport({ ...viewingReport, status: "completed" });
      setSuccessMsg("Report marked as completed"); setTimeout(() => setSuccessMsg(null), 3000);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to update report"); }
  }

  function openEditReport(r: Report, e?: React.MouseEvent) {
    e?.stopPropagation();
    setEditReportTarget(r);
    setEditReportForm({
      report_type: r.report_type,
      status: r.status,
      report_date: String(r.report_date).slice(0, 16),
      performed_by: r.performed_by ?? "",
      test_name: r.test_name ?? "",
    });
    setEditReportError(null);
    setShowEditReport(true);
  }

  async function handleSaveReport(e: FormEvent) {
    e.preventDefault();
    if (!editReportTarget) return;
    setSavingReport(true); setEditReportError(null);
    try {
      await api.request(`/labs/reports/${editReportTarget.report_id}`, {
        method: "PUT",
        body: JSON.stringify({
          report_type: editReportForm.report_type,
          status: editReportForm.status,
          report_date: new Date(editReportForm.report_date).toISOString(),
          performed_by: editReportForm.performed_by || null,
          test_name: editReportForm.test_name || null,
        }),
      });
      if (viewingReport?.report_id === editReportTarget.report_id) {
        setViewingReport({ ...viewingReport, ...editReportForm, report_date: new Date(editReportForm.report_date).toISOString() });
      }
      setShowEditReport(false);
      setSuccessMsg("Report updated"); setTimeout(() => setSuccessMsg(null), 3000);
      await load();
    } catch (e) { setEditReportError(e instanceof Error ? e.message : "Failed to update report"); } finally { setSavingReport(false); }
  }

  function openEditResult(t: TestResult) {
    setEditingResultId(t.result_id);
    setEditResultForm({ test_value: String(t.test_value), unit: t.unit ?? "" });
    setEditResultError(null);
  }

  async function handleSaveResult(resultId: string) {
    if (!viewingReport) return;
    setSavingResult(true); setEditResultError(null);
    try {
      await api.request(`/labs/reports/${viewingReport.report_id}/test-results/${resultId}`, {
        method: "PUT",
        body: JSON.stringify({ test_value: parseFloat(editResultForm.test_value), unit: editResultForm.unit || null }),
      });
      setEditingResultId(null);
      setSuccessMsg("Test result updated"); setTimeout(() => setSuccessMsg(null), 3000);
      const data = await api.request<TestResult[]>(`/labs/reports/${viewingReport.report_id}/test-results`);
      setTestResults(data);
    } catch (e) { setEditResultError(e instanceof Error ? e.message : "Failed to update result"); } finally { setSavingResult(false); }
  }

  async function handleDeleteResult(resultId: string) {
    if (!viewingReport) return;
    if (!confirm("Delete this test result?")) return;
    try {
      await api.request(`/labs/reports/${viewingReport.report_id}/test-results/${resultId}`, { method: "DELETE" });
      setSuccessMsg("Test result deleted"); setTimeout(() => setSuccessMsg(null), 3000);
      const data = await api.request<TestResult[]>(`/labs/reports/${viewingReport.report_id}/test-results`);
      setTestResults(data);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to delete result"); }
  }

  // Patient search debounce
  useEffect(() => {
    if (!showCreate) return;
    const id = ++patientSearchRef.current;
    const t = setTimeout(async () => {
      setPatientsLoading(true);
      try {
        const q = patientQuery.trim();
        const p = await api.request<PatientOption[]>(`/patients/?skip=0&limit=20${q ? `&search=${encodeURIComponent(q)}` : ""}`);
        if (id !== patientSearchRef.current) return;
        setPatients(p);
      } catch { setPatients([]); } finally { if (id === patientSearchRef.current) setPatientsLoading(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [showCreate, patientQuery]);

  // Load visits when patient selected
  useEffect(() => {
    if (!showCreate || !reportForm.patient_id) { setPatientVisits([]); return; }
    let cancelled = false;
    setPatientVisitsLoading(true);
    api.request<VisitOption[]>(`/labs/patient-visits?patient_id=${encodeURIComponent(reportForm.patient_id)}&skip=0&limit=100`)
      .then((v) => { if (!cancelled) setPatientVisits(v); })
      .catch(() => { if (!cancelled) setPatientVisits([]); })
      .finally(() => { if (!cancelled) setPatientVisitsLoading(false); });
    return () => { cancelled = true; };
  }, [showCreate, reportForm.patient_id]);

  function openCreate() {
    setCreateError(null);
    setPatientQuery("");
    // For lab users, pre-fill and lock the lab field
    if (isLabRole && myLabId) {
      const myLab = labs.find((l) => l.lab_id === myLabId);
      setLabQuery(myLab?.lab_name ?? "");
      setReportForm({ patient_id: "", lab_id: myLabId, visit_id: "", report_date: new Date().toISOString().slice(0, 16), report_type: "blood_test", status: "pending", test_name: "", performed_by: "" });
    } else {
      setLabQuery("");
      setReportForm({ patient_id: "", lab_id: "", visit_id: "", report_date: new Date().toISOString().slice(0, 16), report_type: "blood_test", status: "pending", test_name: "", performed_by: "" });
    }
    setPatientVisits([]);
    setShowCreate(true);
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!reportForm.patient_id || !reportForm.lab_id) { setCreateError("Please select a patient and lab."); return; }
    setCreateError(null); setCreating(true);
    try {
      await api.request("/labs/reports/", {
        method: "POST",
        body: JSON.stringify({ ...reportForm, report_date: new Date(reportForm.report_date).toISOString(), test_name: reportForm.test_name || null, pdf_url: null, visit_id: reportForm.visit_id || null }),
      });
      setShowCreate(false);
      setSuccessMsg("Report created successfully"); setTimeout(() => setSuccessMsg(null), 3000);
      await load();
    } catch (e) { setCreateError(e instanceof Error ? e.message : "Failed to create report"); } finally { setCreating(false); }
  }

  const labMap = Object.fromEntries(labs.map((l) => [l.lab_id, l]));
  const filteredLabs = labs.filter((l) => { const q = labQuery.trim().toLowerCase(); if (!q) return true; return l.lab_name.toLowerCase().includes(q); }).slice(0, 20);
  const filteredPatients = patients.filter((p) => { const q = patientQuery.trim().toLowerCase(); if (!q) return true; return `${p.first_name} ${p.last_name}`.toLowerCase().includes(q) || p.cnic.toLowerCase().includes(q); }).slice(0, 20);

  const filtered = reports.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (patientNameMap[r.patient_id] ?? "").toLowerCase().includes(q)
      || (labMap[r.lab_id]?.lab_name ?? "").toLowerCase().includes(q)
      || r.report_type.replace(/_/g, " ").toLowerCase().includes(q);
  });
  const statusCounts = reports.reduce(
    (acc, report) => {
      if (report.status === "pending") acc.pending += 1;
      if (report.status === "completed") acc.completed += 1;
      return acc;
    },
    { pending: 0, completed: 0 }
  );

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="space-y-4">
      <PageHeader
        title="Reports"
        subtitle="All patient lab reports across the system."
        icon={<FileText size={20} />}
        right={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                className="w-64 rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition focus:border-primary/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="Search patient, lab, type..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button className="btn-primary whitespace-nowrap" onClick={openCreate}>
              <Plus size={16} /> New Report
            </button>
          </div>
        }
      />

      {error && <div className="card p-4 text-sm text-danger">{error}</div>}
      {successMsg && <div className="alert-success">{successMsg}</div>}

      {/* Edit Report Modal */}
      {showEditReport && editReportTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(15,23,42,0.45)", backdropFilter: "blur(4px)" }}>
          <motion.div initial={{ opacity: 0, scale: 0.96, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.22 }}
            className="w-full max-w-lg rounded-2xl border border-primary/10 shadow-2xl"
            style={{ background: "rgba(255,255,255,0.97)", backdropFilter: "blur(20px)" }}>
            <div className="flex items-center justify-between border-b border-primary/10 px-6 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-linear-to-r from-blue-600 to-cyan-500 shadow-md shadow-primary/20">
                  <Pencil size={16} className="text-white" />
                </div>
                <h2 className="text-base font-semibold text-slate-800">Edit Report</h2>
              </div>
              <button className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-100" onClick={() => setShowEditReport(false)}><X size={16} /></button>
            </div>
            <form className="space-y-4 px-6 py-5" onSubmit={handleSaveReport}>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">Report Type</label>
                  <select className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm transition focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15"
                    value={editReportForm.report_type} onChange={(e) => setEditReportForm({ ...editReportForm, report_type: e.target.value })}>
                    {REPORT_TYPE_OPTIONS.map((o) => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">Status</label>
                  <select className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm transition focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15"
                    value={editReportForm.status} onChange={(e) => setEditReportForm({ ...editReportForm, status: e.target.value })}>
                    <option value="pending">Pending</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">Date</label>
                <input type="datetime-local" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm transition focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15"
                  value={editReportForm.report_date} onChange={(e) => setEditReportForm({ ...editReportForm, report_date: e.target.value })} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">Performed By</label>
                <input className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 shadow-sm transition focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15"
                  value={editReportForm.performed_by} onChange={(e) => setEditReportForm({ ...editReportForm, performed_by: e.target.value })} placeholder="e.g., John Doe" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">Test Name <span className="text-slate-400 font-normal">(Optional)</span></label>
                <input className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 shadow-sm transition focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15"
                  value={editReportForm.test_name} onChange={(e) => setEditReportForm({ ...editReportForm, test_name: e.target.value })} placeholder="e.g., CBC Panel" />
              </div>
              {editReportError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{editReportError}</div>}
              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button type="button" className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50" onClick={() => setShowEditReport(false)}>Cancel</button>
                <button className="btn-primary" disabled={savingReport}>{savingReport ? "Saving..." : "Save Changes"}</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Create Report Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(15,23,42,0.45)", backdropFilter: "blur(4px)" }}>
          <motion.div initial={{ opacity: 0, scale: 0.96, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.22 }}
            className="w-full max-w-2xl rounded-2xl border border-primary/10 shadow-2xl"
            style={{ background: "rgba(255,255,255,0.97)", backdropFilter: "blur(20px)" }}>
            <div className="flex items-center justify-between border-b border-primary/10 px-6 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-linear-to-r from-blue-600 to-cyan-500 shadow-md shadow-primary/20">
                  <FlaskConical size={16} className="text-white" />
                </div>
                <h2 className="text-base font-semibold text-slate-800">Create Lab Report</h2>
              </div>
              <button className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-100" onClick={() => setShowCreate(false)}><X size={16} /></button>
            </div>
            <form className="max-h-[80vh] space-y-4 overflow-y-auto px-6 py-5" onSubmit={handleCreate}>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {/* Patient */}
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">Patient <span className="text-primary">*</span></label>
                  <div className="relative">
                    <input className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 shadow-sm transition focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15"
                      value={patientQuery}
                      onChange={(e) => { setPatientQuery(e.target.value); setReportForm((p) => ({ ...p, patient_id: "", visit_id: "" })); setShowPatientOptions(true); }}
                      onFocus={() => setShowPatientOptions(true)}
                      onBlur={() => setTimeout(() => setShowPatientOptions(false), 120)}
                      placeholder={patientsLoading ? "Loading..." : "Type patient name or CNIC"} />
                    {showPatientOptions && !patientsLoading && (
                      <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-2xl">
                        {filteredPatients.length > 0 ? filteredPatients.map((p) => (
                          <button key={p.patient_id} type="button"
                            className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 transition"
                            onMouseDown={(e) => { e.preventDefault(); setReportForm((prev) => ({ ...prev, patient_id: p.patient_id, visit_id: "" })); setPatientQuery(`${p.first_name} ${p.last_name} (${p.cnic})`); setShowPatientOptions(false); }}>
                            {p.first_name} {p.last_name} <span className="text-slate-400 text-xs">({p.cnic})</span>
                          </button>
                        )) : <div className="px-3 py-2 text-xs text-slate-400">No matching patients</div>}
                      </div>
                    )}
                  </div>
                </div>
                {/* Lab */}
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">Lab <span className="text-primary">*</span></label>
                  {isLabRole && myLabId ? (
                    <input className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 shadow-sm cursor-not-allowed" value={labQuery} readOnly />
                  ) : (
                    <div className="relative">
                      <input className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 shadow-sm transition focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15"
                        value={labQuery}
                        onChange={(e) => { setLabQuery(e.target.value); setReportForm((p) => ({ ...p, lab_id: "" })); setShowLabOptions(true); }}
                        onFocus={() => setShowLabOptions(true)}
                        onBlur={() => setTimeout(() => setShowLabOptions(false), 120)}
                        placeholder="Type lab name" />
                      {showLabOptions && (
                        <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-2xl">
                          {filteredLabs.length > 0 ? filteredLabs.map((l) => (
                            <button key={l.lab_id} type="button"
                              className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 transition"
                              onMouseDown={(e) => { e.preventDefault(); setReportForm((p) => ({ ...p, lab_id: l.lab_id })); setLabQuery(l.lab_name); setShowLabOptions(false); }}>
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
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">Report Type <span className="text-primary">*</span></label>
                  <select className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm transition focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15"
                    value={reportForm.report_type} onChange={(e) => setReportForm({ ...reportForm, report_type: e.target.value })} required>
                    {REPORT_TYPE_OPTIONS.map((o) => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">Status</label>
                  <select className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm transition focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15"
                    value={reportForm.status} onChange={(e) => setReportForm({ ...reportForm, status: e.target.value })}>
                    <option value="pending">Pending</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">Linked Visit <span className="text-slate-400 font-normal">(Optional)</span></label>
                  <select className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm transition focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15 disabled:opacity-50"
                    value={reportForm.visit_id} onChange={(e) => setReportForm({ ...reportForm, visit_id: e.target.value })}
                    disabled={!reportForm.patient_id || patientVisitsLoading}>
                    <option value="">{patientVisitsLoading ? "Loading..." : "No linked visit"}</option>
                    {patientVisits.map((v) => (
                      <option key={v.visit_id} value={v.visit_id}>
                        {new Date(v.visit_date).toLocaleDateString()} – {v.visit_type.replace(/_/g, " ")}{v.chief_complaint ? ` – ${v.chief_complaint}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">Date <span className="text-primary">*</span></label>
                  <input type="datetime-local" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm transition focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15"
                    value={reportForm.report_date} onChange={(e) => setReportForm({ ...reportForm, report_date: e.target.value })} required />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">Performed By</label>
                <input className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 shadow-sm transition focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15"
                  value={reportForm.performed_by} onChange={(e) => setReportForm({ ...reportForm, performed_by: e.target.value })} placeholder="e.g., John Doe" />
              </div>
              {createError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{createError}</div>}
              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button type="button" className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50" onClick={() => setShowCreate(false)}>Cancel</button>
                <button className="btn-primary" disabled={creating}>{creating ? "Creating..." : "Create Report"}</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* View Report Modal */}
      {viewModalOpen && viewingReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-hidden" style={{ background: "rgba(15,23,42,0.55)", backdropFilter: "blur(4px)" }}>
          <div className="bg-white text-slate-900 w-full max-w-4xl max-h-[95vh] rounded-xl shadow-2xl flex flex-col relative overflow-hidden">
            <button className="absolute top-2 right-2 z-20 p-2 hover:bg-slate-100 rounded-full transition" onClick={() => setViewModalOpen(false)}>
              <X size={20} className="text-slate-500" />
            </button>
            <div className="flex-1 overflow-y-auto">
              {/* Report header */}
              <div className="pt-12 p-8 border-b-4 border-primary bg-slate-50 flex flex-col md:flex-row justify-between items-start gap-6">
                <div>
                  <div className="flex items-center gap-2 text-primary mb-2">
                    <FlaskConical size={24} />
                    <h2 className="text-xl font-bold">{labMap[viewingReport.lab_id]?.lab_name ?? "Laboratory"}</h2>
                  </div>
                  <div className="text-sm text-slate-500">
                    <p>{labMap[viewingReport.lab_id]?.lab_location}</p>
                    <p>Accreditation: {labMap[viewingReport.lab_id]?.accreditation_number ?? "-"}</p>
                  </div>
                </div>
                <div className="md:text-right">
                  <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Lab Report</h1>
                  <p className="text-sm text-slate-500">Patient: <span className="font-semibold text-slate-700">{patientNameMap[viewingReport.patient_id] ?? "-"}</span></p>
                  <p className="text-sm text-slate-500">ID: {viewingReport.report_id.slice(0, 8).toUpperCase()}</p>
                  <p className="text-sm text-slate-500">Date: {new Date(viewingReport.report_date).toLocaleDateString()}</p>
                  <div className="mt-2">
                    <span className={`badge ${viewingReport.status === "completed" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>
                      {viewingReport.status.toUpperCase()}
                    </span>
                  </div>
                  {viewingReport.performed_by && <p className="mt-1 text-xs font-semibold text-slate-400 italic">Performed By: {viewingReport.performed_by}</p>}
                </div>
              </div>

              <div className="p-8 space-y-8">
                <div>
                  <h3 className="text-lg font-bold border-l-4 border-primary pl-3 mb-4">{viewingReport.test_name ?? "Diagnostic Results"}</h3>
                  {testResults.length === 0 ? (
                    <div className="py-12 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      <p className="text-slate-400">No test results recorded yet.</p>
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-xl border border-slate-200">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50">
                          <tr className="text-[10px] font-bold uppercase text-slate-400">
                            <th className="px-4 py-3 text-left">Test</th>
                            <th className="px-4 py-3 text-center">Value</th>
                            <th className="px-4 py-3 text-center">Status</th>
                            <th className="px-4 py-3 text-right">Reference Range</th>
                            <th className="px-4 py-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {testResults.map((t) =>
                            editingResultId === t.result_id ? (
                              <tr key={t.result_id} className="bg-blue-50/60">
                                <td className="px-4 py-3 font-medium capitalize text-sm">{t.test_name.replace(/_/g, " ")}</td>
                                <td className="px-4 py-3 text-center">
                                  <input type="number" step="0.01" autoFocus
                                    className="w-20 rounded-lg border border-primary/40 bg-white px-2 py-1 text-sm text-center font-bold focus:outline-none focus:ring-2 focus:ring-primary/20"
                                    value={editResultForm.test_value} onChange={(e) => setEditResultForm({ ...editResultForm, test_value: e.target.value })} />
                                </td>
                                <td className="px-4 py-3 text-center text-xs text-slate-400">—</td>
                                <td className="px-4 py-3 text-right">
                                  <input className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-primary/20"
                                    value={editResultForm.unit} onChange={(e) => setEditResultForm({ ...editResultForm, unit: e.target.value })} placeholder="unit" />
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <div className="flex justify-end gap-1.5">
                                    <button type="button" className="rounded-lg bg-primary/10 text-primary hover:bg-primary/20 px-2.5 py-1 text-xs font-semibold transition" onClick={() => handleSaveResult(t.result_id)} disabled={savingResult}>{savingResult ? "..." : "Save"}</button>
                                    <button type="button" className="rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 px-2.5 py-1 text-xs font-semibold transition" onClick={() => setEditingResultId(null)}>Cancel</button>
                                  </div>
                                  {editResultError && <p className="text-xs text-danger mt-1 text-right">{editResultError}</p>}
                                </td>
                              </tr>
                            ) : (
                              <tr key={t.result_id} className="hover:bg-slate-50/50">
                                <td className="px-4 py-4 font-medium capitalize">{t.test_name.replace(/_/g, " ")}</td>
                                <td className="px-4 py-4 text-center font-bold">{t.test_value} <span className="text-xs font-normal text-slate-400">{t.unit}</span></td>
                                <td className="px-4 py-4 text-center">
                                  {t.is_abnormal
                                    ? <span className="text-[10px] font-bold text-danger bg-danger/10 px-2 py-0.5 rounded">ABNORMAL</span>
                                    : <span className="text-[10px] font-bold text-success bg-success/10 px-2 py-0.5 rounded">NORMAL</span>}
                                </td>
                                <td className="px-4 py-4 text-right text-slate-400 font-mono text-xs">{t.reference_range_min} – {t.reference_range_max}</td>
                                <td className="px-4 py-4 text-right">
                                  <div className="flex justify-end gap-1.5">
                                    <button type="button" className="p-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition" title="Edit" onClick={() => openEditResult(t)}><Pencil size={12} /></button>
                                    <button type="button" className="p-1.5 rounded-lg bg-danger/10 text-danger hover:bg-danger/20 transition" title="Delete" onClick={() => handleDeleteResult(t.result_id)}><Trash2 size={12} /></button>
                                  </div>
                                </td>
                              </tr>
                            )
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Add test result */}
                <div className="bg-slate-50 rounded-xl p-6 border border-slate-200">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-bold flex items-center gap-2"><Plus size={16} /> Add Test Result</h4>
                    {!showAddResult && <button className="btn-primary text-xs" onClick={() => setShowAddResult(true)}>Enter Result</button>}
                  </div>
                  {showAddResult && (
                    <form className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end" onSubmit={handleAddResult}>
                      <div className="md:col-span-2">
                        <label className="block text-xs font-bold text-slate-500 mb-1">Test Name *</label>
                        <select className="input input-light" value={resultForm.test_name}
                          onChange={(e) => { const t = supportedTests.find((s) => s.test_name === e.target.value); setResultForm((p) => ({ ...p, test_name: e.target.value, unit: t?.unit ?? "" })); }} required>
                          <option value="">Select test...</option>
                          {supportedTests.map((t) => <option key={t.test_name} value={t.test_name}>{t.test_name.replace(/_/g, " ")}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Value *</label>
                        <input className="input input-light" type="number" step="0.01" value={resultForm.test_value} onChange={(e) => setResultForm({ ...resultForm, test_value: e.target.value })} required />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Unit</label>
                        <input className="input input-light bg-slate-50 text-slate-600" value={resultForm.unit} readOnly />
                      </div>
                      <div className="md:col-span-4 flex justify-end gap-2 mt-2">
                        <button type="button" className="btn-ghost text-xs" onClick={() => setShowAddResult(false)}>Cancel</button>
                        <button className="btn-primary text-xs" disabled={addingResult}>{addingResult ? "Saving..." : "Save Result"}</button>
                      </div>
                      {resultError && <p className="md:col-span-4 text-xs text-danger mt-1">{resultError}</p>}
                    </form>
                  )}
                </div>

                {/* Oral Scan */}
                <div className="bg-slate-50 rounded-xl p-6 border border-slate-200">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-bold flex items-center gap-2"><ScanLine size={16} /> Oral Scan</h4>
                    {!showOralScan && (
                      <button className="btn-primary text-xs" onClick={() => { setShowOralScan(true); setOralScanResult(null); setOralScanError(null); setOralScanFile(null); }}>
                        Oral Scan
                      </button>
                    )}
                  </div>
                  {showOralScan && (
                    <form className="flex flex-col gap-4" onSubmit={handleOralScan}>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Upload Oral Image *</label>
                        <input
                          type="file"
                          accept="image/*"
                          required
                          className="block w-full text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 transition"
                          onChange={(e) => setOralScanFile(e.target.files?.[0] ?? null)}
                        />
                        {oralScanFile && (
                          <p className="text-xs text-slate-400 mt-1">{oralScanFile.name} ({(oralScanFile.size / 1024).toFixed(1)} KB)</p>
                        )}
                      </div>
                      <div className="flex justify-end gap-2">
                        <button type="button" className="btn-ghost text-xs" onClick={() => { setShowOralScan(false); setOralScanResult(null); setOralScanError(null); }}>Cancel</button>
                        <button className="btn-primary text-xs flex items-center gap-1.5" disabled={oralScanLoading || !oralScanFile}>
                          {oralScanLoading ? <><span className="animate-spin inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full" /> Analysing...</> : <><ScanLine size={12} /> Run Scan</>}
                        </button>
                      </div>
                      {oralScanError && <p className="text-xs text-danger">{oralScanError}</p>}
                    </form>
                  )}
                  {oralScanResult && (
                    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 space-y-2">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Scan Result</p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500">Diagnosis</span>
                        <span className="text-sm font-bold text-slate-800">{oralScanResult.diagnosis_label}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500">Progression Stage</span>
                        <span className={`text-sm font-bold ${oralScanResult.progression_stage === "No Oral Lesion Detected" ? "text-success" : oralScanResult.progression_stage === "Suspicious Oral Lesion" ? "text-warning" : "text-danger"}`}>
                          {oralScanResult.progression_stage}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500">Confidence</span>
                        <span className="text-sm font-semibold text-slate-700">{(oralScanResult.confidence_score * 100).toFixed(1)}%</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="p-6 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
              <button className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                onClick={() => { setViewModalOpen(false); openEditReport(viewingReport); }}>
                <Pencil size={14} /> Edit Report
              </button>
              <div className="flex gap-3">
                <button className="btn-ghost" onClick={() => window.print()}>Print</button>
                <button className="btn-primary" onClick={() => setViewModalOpen(false)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="card overflow-x-auto p-0">
        {/* Status filter tabs */}
        <div className="flex items-center gap-1 border-b border-border/50 px-4 py-3">
          {(["all", "pending", "completed"] as const).map((s) => (
            <button key={s} type="button" onClick={() => setStatusFilter(s)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition capitalize ${
                statusFilter === s
                  ? s === "pending" ? "bg-warning/20 text-warning"
                    : s === "completed" ? "bg-success/20 text-success"
                    : "bg-white text-primary shadow-sm border border-border/50"
                  : "text-muted hover:text-foreground"
              }`}>
              {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
              {s === "pending" && <span className="ml-1.5 opacity-70">({statusCounts.pending})</span>}
              {s === "completed" && <span className="ml-1.5 opacity-70">({statusCounts.completed})</span>}
            </button>
          ))}
          <span className="ml-auto text-xs text-slate-400">{filtered.length} report{filtered.length !== 1 ? "s" : ""}</span>
        </div>

        <table className="w-full min-w-175 text-sm">
          <thead className="table-header">
            <tr>
              <th className="px-4 py-3 text-left">Patient</th>
              <th className="px-4 py-3 text-left">Lab</th>
              <th className="px-4 py-3 text-left">Type</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Date</th>
              <th className="px-4 py-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.report_id} className="table-row cursor-pointer hover:bg-primary/5 transition" onClick={() => selectReport(r)}>
                <td className="px-4 py-3 font-medium text-slate-800">{patientNameMap[r.patient_id] ?? <span className="text-slate-400 text-xs">{r.patient_id.slice(0, 8)}</span>}</td>
                <td className="px-4 py-3 text-slate-600">{labMap[r.lab_id]?.lab_name ?? "-"}</td>
                <td className="px-4 py-3 capitalize">{r.report_type.replace(/_/g, " ")}</td>
                <td className="px-4 py-3"><span className={`badge ${r.status === "completed" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>{r.status}</span></td>
                <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{String(r.report_date).slice(0, 10)}</td>
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <div className="flex gap-2">
                    <button className="p-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition" title="Edit" onClick={(e) => openEditReport(r, e)}>
                      <Pencil size={14} />
                    </button>
                    {r.status === "pending" && (
                      <button className="p-1.5 rounded-lg bg-success/10 text-success hover:bg-success/20 transition" title="Mark Completed" onClick={() => handleMarkCompleted(r.report_id)}>
                        <CheckCircle size={14} />
                      </button>
                    )}
                    <button className="p-1.5 rounded-lg bg-danger/10 text-danger hover:bg-danger/20 transition" title="Delete" onClick={() => handleDelete(r.report_id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">No reports found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
