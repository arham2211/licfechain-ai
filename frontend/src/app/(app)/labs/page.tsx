"use client";

import { useEffect, useState, FormEvent } from "react";
import { motion } from "framer-motion";
import { FlaskConical, Plus, X, Trash2, CheckCircle, AlertTriangle, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api-client";
import { getUser } from "@/lib/auth-store";
import { PatientSearch } from "@/components/ui/PatientSearch";

type Lab = { lab_id: string; lab_name: string; lab_location?: string; accreditation_number?: string; phone?: string; email?: string };
type Report = { report_id: string; report_type: string; status: string; report_date: string; patient_id: string; lab_id: string; test_name?: string; performed_by?: string };
type PatientOption = { patient_id: string; first_name: string; last_name: string; cnic: string };
type TestResult = { result_id: string; test_name: string; test_value: number; unit?: string; reference_range_min?: number; reference_range_max?: number; is_abnormal?: boolean };

export default function LabsPage() {
  const user = getUser();
  const userRoles = user?.roles ?? [];

  const [localViewMode, setLocalViewMode] = useState<"clinical" | "personal">("clinical");
  const [patientId, setPatientId] = useState("");
  const [isPatient, setIsPatient] = useState(false);

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
  const [reportForm, setReportForm] = useState({ patient_id: "", lab_id: "", report_date: new Date().toISOString().slice(0, 16), report_type: "blood_test", status: "pending", test_name: "", performed_by: "" });
  const [creatingReport, setCreatingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  // View Report Modal
  const [viewingReport, setViewingReport] = useState<Report | null>(null);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [testResults, setTestResults] = useState<TestResult[]>([]);

  // Managing results (Admin/Doctor)
  const [showAddResult, setShowAddResult] = useState(false);
  const [resultForm, setResultForm] = useState({ test_name: "", test_value: "", unit: "" });
  const [addingResult, setAddingResult] = useState(false);
  const [resultError, setResultError] = useState<string | null>(null);

  useEffect(() => {
    const u = getUser();
    if (!u) return;
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
  }, [localViewMode]);

  useEffect(() => { loadAll(); }, [patientId, localViewMode]);

  async function loadAll() {
    try {
      const reportsUrl = patientId
        ? `/labs/reports?patient_id=${patientId}&skip=0&limit=100`
        : "/labs/reports?skip=0&limit=100";

      const [l, r] = await Promise.all([
        api.request<Lab[]>("/labs/?skip=0&limit=50"),
        api.request<Report[]>(reportsUrl),
      ]);
      setLabs(l);
      setReports(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load labs");
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
      setSuccessMsg("Lab created"); setTimeout(() => setSuccessMsg(null), 3000); await loadAll();
    } catch (e) { setLabError(e instanceof Error ? e.message : "Failed to create lab"); } finally { setCreatingLab(false); }
  }

  async function openCreateReport() {
    setShowCreateReport(true);
    try { const p = await api.request<PatientOption[]>("/patients/?skip=0&limit=500"); setPatients(p); } catch { }
  }

  async function handleCreateReport(e: FormEvent) {
    e.preventDefault(); setReportError(null); setCreatingReport(true);
    try {
      await api.request("/labs/reports/", {
        method: "POST", body: JSON.stringify({
          ...reportForm, report_date: new Date(reportForm.report_date).toISOString(),
          test_name: reportForm.test_name || null, pdf_url: null, visit_id: null,
        })
      });
      setShowCreateReport(false); setReportForm({ patient_id: "", lab_id: "", report_date: new Date().toISOString().slice(0, 16), report_type: "blood_test", status: "pending", test_name: "", performed_by: "" });
      setSuccessMsg("Report created"); setTimeout(() => setSuccessMsg(null), 3000); await loadAll();
    } catch (e) { setReportError(e instanceof Error ? e.message : "Failed to create report"); } finally { setCreatingReport(false); }
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
      setSuccessMsg("Test result added"); setTimeout(() => setSuccessMsg(null), 3000);
      await selectReport(viewingReport);
    } catch (e) { setResultError(e instanceof Error ? e.message : "Failed to add result"); } finally { setAddingResult(false); }
  }

  async function handleDeleteLab(labId: string) {
    if (!confirm("Delete this lab?")) return;
    try { await api.request(`/labs/${labId}`, { method: "DELETE" }); await loadAll(); } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
  }

  async function handleDeleteReport(reportId: string) {
    if (!confirm("Delete this report?")) return;
    try {
      await api.request(`/labs/reports/${reportId}`, { method: "DELETE" });
      if (viewingReport?.report_id === reportId) {
        setViewingReport(null);
        setTestResults([]);
        setViewModalOpen(false);
      }
      await loadAll();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="space-y-4">
      <PageHeader
        title={isPatient ? "My Lab Reports" : "Labs & Reports"}
        subtitle={isPatient ? "Your diagnostic test results and lab values." : "Cross-lab diagnostics ingestion and test result tracking."}
        icon={<FlaskConical size={20} />}
        right={
          <div className="flex flex-col md:flex-row items-end md:items-center gap-4">
            {!isPatient && (
              <div className="flex items-center gap-2 overflow-visible relative z-40">
                <PatientSearch onSelect={setPatientId} className="w-64" />
                {canCreateLab && <button className="btn-primary text-sm whitespace-nowrap" onClick={() => setShowCreateLab(true)}><Plus size={16} /> New Lab</button>}
                {canCreateReport && <button className="btn-primary text-sm whitespace-nowrap" onClick={openCreateReport}><Plus size={16} /> New Report</button>}
              </div>
            )}

            {user?.roles.includes("doctor") && user?.patient_id && (
              <div className="flex items-center gap-1 rounded-full bg-slate-100 p-1">
                <button
                  onClick={() => setLocalViewMode("clinical")}
                  className={`px-3 py-1.5 text-xs font-bold rounded-full transition ${localViewMode === "clinical" ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                >
                  Clinical
                </button>
                <button
                  onClick={() => setLocalViewMode("personal")}
                  className={`px-3 py-1.5 text-xs font-bold rounded-full transition ${localViewMode === "personal" ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-emerald-500"}`}
                >
                  Personal
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
            <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Create Lab</h2><button className="btn-ghost text-sm" onClick={() => setShowCreateLab(false)}><X size={16} /></button></div>
            <form className="mt-4 space-y-4" onSubmit={handleCreateLab}>
              <div><label className="mb-1 block text-sm font-medium">Lab Name *</label><input className="input" value={labForm.lab_name} onChange={(e) => setLabForm({ ...labForm, lab_name: e.target.value })} required placeholder="e.g., Chughtai Lab" /></div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div><label className="mb-1 block text-sm font-medium">Location</label><input className="input" value={labForm.lab_location} onChange={(e) => setLabForm({ ...labForm, lab_location: e.target.value })} /></div>
                <div><label className="mb-1 block text-sm font-medium">Accreditation #</label><input className="input" value={labForm.accreditation_number} onChange={(e) => setLabForm({ ...labForm, accreditation_number: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div><label className="mb-1 block text-sm font-medium">Phone</label><input className="input" value={labForm.phone} onChange={(e) => setLabForm({ ...labForm, phone: e.target.value })} /></div>
                <div><label className="mb-1 block text-sm font-medium">Email</label><input className="input" type="email" value={labForm.email} onChange={(e) => setLabForm({ ...labForm, email: e.target.value })} /></div>
              </div>
              {labError && <p className="text-sm text-danger">{labError}</p>}
              <div className="flex justify-end gap-2"><button type="button" className="btn-ghost text-sm" onClick={() => setShowCreateLab(false)}>Cancel</button><button className="btn-primary" disabled={creatingLab}>{creatingLab ? "Creating..." : "Create Lab"}</button></div>
            </form>
          </div>
        </div>
      )}

      {/* Create Report Modal */}
      {showCreateReport && (
        <div className="modal-overlay">
          <div className="card w-full max-w-lg p-6">
            <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Create Lab Report</h2><button className="btn-ghost text-sm" onClick={() => setShowCreateReport(false)}><X size={16} /></button></div>
            <form className="mt-4 space-y-4" onSubmit={handleCreateReport}>
              <div><label className="mb-1 block text-sm font-medium">Patient *</label><select className="input" value={reportForm.patient_id} onChange={(e) => setReportForm({ ...reportForm, patient_id: e.target.value })} required><option value="">-- Select --</option>{patients.map((p) => <option key={p.patient_id} value={p.patient_id}>{p.first_name} {p.last_name} ({p.cnic})</option>)}</select></div>
              <div><label className="mb-1 block text-sm font-medium">Lab *</label><select className="input" value={reportForm.lab_id} onChange={(e) => setReportForm({ ...reportForm, lab_id: e.target.value })} required><option value="">-- Select --</option>{labs.map((l) => <option key={l.lab_id} value={l.lab_id}>{l.lab_name}</option>)}</select></div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div><label className="mb-1 block text-sm font-medium">Report Type *</label><input className="input" value={reportForm.report_type} onChange={(e) => setReportForm({ ...reportForm, report_type: e.target.value })} required /></div>
                <div><label className="mb-1 block text-sm font-medium">Status</label><select className="input" value={reportForm.status} onChange={(e) => setReportForm({ ...reportForm, status: e.target.value })}><option value="pending">Pending</option><option value="completed">Completed</option></select></div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div><label className="mb-1 block text-sm font-medium">Date *</label><input className="input" type="datetime-local" value={reportForm.report_date} onChange={(e) => setReportForm({ ...reportForm, report_date: e.target.value })} required /></div>
                <div><label className="mb-1 block text-sm font-medium">Test Name</label><input className="input" value={reportForm.test_name} onChange={(e) => setReportForm({ ...reportForm, test_name: e.target.value })} /></div>
              </div>
              <div><label className="mb-1 block text-sm font-medium">Technician Name (Performed By)</label><input className="input" value={reportForm.performed_by} onChange={(e) => setReportForm({ ...reportForm, performed_by: e.target.value })} placeholder="e.g., John Doe" /></div>
              {reportError && <p className="text-sm text-danger">{reportError}</p>}
              <div className="flex justify-end gap-2"><button type="button" className="btn-ghost text-sm" onClick={() => setShowCreateReport(false)}>Cancel</button><button className="btn-primary" disabled={creatingReport}>{creatingReport ? "Creating..." : "Create Report"}</button></div>
            </form>
          </div>
        </div>
      )}

      {/* Patient view or Clinical view with focused patient: Just their reports */}
      {isPatient || patientId ? (
        <div className="card p-0 overflow-x-auto overflow-visible relative z-10">
          <div className="border-b border-border px-5 py-3 font-semibold gradient-text">
            {isPatient ? "My Reports" : "Patient Reports"} ({reports.length})
          </div>
          <table className="w-full min-w-[500px] text-sm">
            <thead className="table-header"><tr><th className="px-4 py-3 text-left">Type</th><th className="px-4 py-3 text-left">Status</th><th className="px-4 py-3 text-left">Date</th><th className="px-4 py-3 text-left">Test</th></tr></thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.report_id} className={`table-row cursor-pointer transition ${viewingReport?.report_id === r.report_id ? "bg-primary/5" : "hover:bg-primary/5"}`} onClick={() => selectReport(r)}>
                  <td className="px-4 py-3 capitalize">{r.report_type.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3"><span className={`badge ${r.status === "completed" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>{r.status}</span></td>
                  <td className="px-4 py-3">{String(r.report_date).slice(0, 10)}</td>
                  <td className="px-4 py-3">{r.test_name ?? "-"}</td>
                </tr>
              ))}
              {reports.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted">No lab reports found.</td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        /* Admin/Doctor/Lab view: Labs + Reports */
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="card overflow-x-auto p-0">
            <div className="border-b border-border px-4 py-3 font-semibold">Labs ({labs.length})</div>
            <table className="w-full min-w-[400px] text-sm">
              <thead className="table-header"><tr><th className="px-4 py-3 text-left">Name</th><th className="px-4 py-3 text-left">Location</th><th className="px-4 py-3 text-left">Accr.</th>{canCreateLab && <th className="px-4 py-3 text-left">Act</th>}</tr></thead>
              <tbody>
                {labs.map((lab) => (
                  <tr key={lab.lab_id} className="table-row"><td className="px-4 py-3 font-medium">{lab.lab_name}</td><td className="px-4 py-3">{lab.lab_location ?? "-"}</td><td className="px-4 py-3">{lab.accreditation_number ?? "-"}</td>{canCreateLab && <td className="px-4 py-3"><button className="text-danger hover:text-danger/80 transition" onClick={() => handleDeleteLab(lab.lab_id)}><Trash2 size={14} /></button></td>}</tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card overflow-x-auto p-0">
            <div className="border-b border-border px-4 py-3 font-semibold">Reports ({reports.length})</div>
            <table className="w-full min-w-[400px] text-sm">
              <thead className="table-header"><tr><th className="px-4 py-3 text-left">Type</th><th className="px-4 py-3 text-left">Status</th><th className="px-4 py-3 text-left">Date</th><th className="px-4 py-3 text-left">Act</th></tr></thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.report_id} className={`table-row cursor-pointer transition ${viewingReport?.report_id === r.report_id ? "bg-primary/5" : "hover:bg-primary/5"}`} onClick={() => selectReport(r)}>
                    <td className="px-4 py-3">{r.report_type}</td>
                    <td className="px-4 py-3"><span className={`badge ${r.status === "completed" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>{r.status}</span></td>
                    <td className="px-4 py-3">{String(r.report_date).slice(0, 10)}</td>
                    <td className="px-4 py-3"><button className="text-danger hover:text-danger/80 transition" onClick={(e) => { e.stopPropagation(); handleDeleteReport(r.report_id); }}><Trash2 size={14} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
                    <h2 className="text-xl font-bold">{labs.find(l => l.lab_id === viewingReport.lab_id)?.lab_name || "Laboratory"}</h2>
                  </div>
                  <div className="text-sm text-slate-500">
                    <p>{labs.find(l => l.lab_id === viewingReport.lab_id)?.lab_location}</p>
                    <p>Accreditation: {labs.find(l => l.lab_id === viewingReport.lab_id)?.accreditation_number}</p>
                  </div>
                </div>
                <div className="md:text-right">
                  <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Lab Report</h1>
                  <p className="text-sm text-slate-500">ID: {viewingReport.report_id.slice(0, 8).toUpperCase()}</p>
                  <p className="text-sm text-slate-500">Date: {new Date(viewingReport.report_date).toLocaleDateString()}</p>
                  <div className="mt-2">
                    <span className={`badge ${viewingReport.status === 'completed' ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'}`}>
                      {viewingReport.status.toUpperCase()}
                    </span>
                  </div>
                  {viewingReport.performed_by && (
                    <p className="mt-1 text-xs font-semibold text-slate-400 italic">Performed By: {viewingReport.performed_by}</p>
                  )}
                </div>
              </div>

              <div className="p-8 space-y-8">
                <div>
                  <h3 className="text-lg font-bold border-l-4 border-primary pl-3 mb-4">{viewingReport.test_name || "DIAGNOSTIC RESULTS"}</h3>
                  {testResults.length === 0 ? (
                    <div className="py-12 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      <p className="text-slate-400">No results recorded yet.</p>
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
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {testResults.map((t) => (
                            <tr key={t.result_id} className="hover:bg-slate-50/50">
                              <td className="px-4 py-4 font-medium capitalize">{t.test_name.replace(/_/g, " ")}</td>
                              <td className="px-4 py-4 text-center font-bold">{t.test_value} <span className="text-xs font-normal text-slate-400">{t.unit}</span></td>
                              <td className="px-4 py-4 text-center">
                                {t.is_abnormal ? <span className="text-[10px] font-bold text-danger bg-danger/10 px-2 py-0.5 rounded">ABNORMAL</span> : <span className="text-[10px] font-bold text-success bg-success/10 px-2 py-0.5 rounded">NORMAL</span>}
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
                      <h4 className="font-bold flex items-center gap-2"><Plus size={16} /> Add Test Result</h4>
                      {!showAddResult && <button className="btn-primary text-xs" onClick={() => setShowAddResult(true)}>Enter Result</button>}
                    </div>

                    {showAddResult && (
                      <form className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end" onSubmit={handleAddResult}>
                        <div className="md:col-span-2">
                          <label className="block text-xs font-bold text-slate-500 mb-1">Test Name *</label>
                          <input className="input" value={resultForm.test_name} onChange={(e) => setResultForm({ ...resultForm, test_name: e.target.value })} required placeholder="e.g., glucose" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1">Value *</label>
                          <input className="input" type="number" step="0.01" value={resultForm.test_value} onChange={(e) => setResultForm({ ...resultForm, test_value: e.target.value })} required />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1">Unit</label>
                          <input className="input" value={resultForm.unit} onChange={(e) => setResultForm({ ...resultForm, unit: e.target.value })} placeholder="e.g., mg/dL" />
                        </div>
                        <div className="md:col-span-4 flex justify-end gap-2 mt-2">
                          <button type="button" className="btn-ghost text-xs" onClick={() => setShowAddResult(false)}>Cancel</button>
                          <button className="btn-primary text-xs" disabled={addingResult}>{addingResult ? "Saving..." : "Save Result"}</button>
                        </div>
                        {resultError && <p className="md:col-span-4 text-xs text-danger mt-1">{resultError}</p>}
                      </form>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-200 flex justify-end gap-3 no-print">
              <button className="btn-ghost" onClick={() => window.print()}>Print</button>
              <button className="btn-primary" onClick={() => setViewModalOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
