"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  GitBranch, Dna, Loader2, AlertTriangle, ShieldAlert,
  Heart, HeartPulse, Users, User, Baby, Crown,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api-client";
import { getUser } from "@/lib/auth-store";
import { PatientSearch } from "@/components/ui/PatientSearch";
import { useLanguage } from "@/components/providers/LanguageProvider";
import { CheckCircle } from "lucide-react";


/* ── API types ── */

type APIDiagnosis = {
  disease_name: string;
  diagnosis_date?: string;
  confidence_score?: number;
  status?: string;
  notes?: string;
  source?: string;
  progression_stage?: string;
  severity_score?: number;
};

type APIRelative = {
  patient_id: string;
  name: string;
  relationship_type: string;
  relationship_to_searched_patient: string;
  depth: number;
  total_diseases: number;
  disease_names: string[];
  diagnoses: APIDiagnosis[];
};

type APIFamilyResponse = {
  patient_id: string;
  patient_name: string;
  total_blood_relatives: number;
  max_depth: number;
  relatives_with_diseases: number;
  relatives_without_diseases: number;
  family_tree: APIRelative[];
};

/* ── Generation classification ── */

type Generation = "grandparents" | "parents" | "self" | "children";

function classifyGeneration(rel: string): Generation {
  const r = rel.toLowerCase();
  if (r.includes("grandparent") || r.includes("grandfather") || r.includes("grandmother")) return "grandparents";
  if (r.includes("father") || r.includes("mother") || r.includes("parent") || r.includes("uncle") || r.includes("aunt")) return "parents";
  if (r.includes("son") || r.includes("daughter") || r.includes("child") || r.includes("nephew") || r.includes("niece")) return "children";
  return "self";
}

type FamilyNode = {
  id: string;
  name: string;
  label: string;
  hasDiseases: boolean;
  diseaseCount: number;
  isSelf: boolean;
  isBlood: boolean;
};

/* ── Disease risk computation ── */

type DiseaseRisk = {
  disease: string;
  affectedRelatives: { name: string; relationship: string }[];
  riskLevel: "high" | "moderate" | "low";
  bloodRelativeCount: number;
};

function computeRisks(tree: APIRelative[]): DiseaseRisk[] {
  const diseaseMap = new Map<string, { name: string; relationship: string }[]>();

  for (const rel of tree) {
    for (const dn of rel.disease_names ?? []) {
      const normalized = dn.toLowerCase().replace(/_/g, " ");
      if (!diseaseMap.has(normalized)) diseaseMap.set(normalized, []);
      diseaseMap.get(normalized)!.push({
        name: rel.name,
        relationship: rel.relationship_to_searched_patient || rel.relationship_type,
      });
    }
  }

  const risks: DiseaseRisk[] = [];
  for (const [disease, relatives] of diseaseMap) {
    const count = relatives.length;
    risks.push({
      disease,
      affectedRelatives: relatives,
      bloodRelativeCount: count,
      riskLevel: count >= 3 ? "high" : count >= 2 ? "moderate" : "low",
    });
  }

  risks.sort((a, b) => b.bloodRelativeCount - a.bloodRelativeCount);
  return risks;
}

const riskColors = {
  high: { bg: "bg-red-500/10", text: "text-red-500", border: "border-red-500/30", bar: "bg-red-500" },
  moderate: { bg: "bg-amber-500/10", text: "text-amber-500", border: "border-amber-500/30", bar: "bg-amber-500" },
  low: { bg: "bg-emerald-500/10", text: "text-emerald-500", border: "border-emerald-500/30", bar: "bg-emerald-500" },
};

const generationMeta: Record<Generation, { labelKey: string; icon: typeof Users }> = {
  grandparents: { labelKey: "grandparents", icon: Crown },
  parents: { labelKey: "parentsAndExtended", icon: Users },
  self: { labelKey: "youAndSiblings", icon: User },
  children: { labelKey: "children", icon: Baby },
};

/* ═══════════════════════════════════════════ */

export default function FamilyPage() {
  const { tr, language } = useLanguage();
  const [localViewMode, setLocalViewMode] = useState<"clinical" | "personal">("clinical");
  const [patientId, setPatientId] = useState("");
  const [isPatient, setIsPatient] = useState(false);
  const [data, setData] = useState<APIFamilyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const user = getUser();
    if (!user) return;
    const isDoctor = user.roles.includes("doctor");
    if (user.roles.includes("patient")) {
      setIsPatient(true);
      setPatientId(user.patient_id || "");
    } else if (isDoctor && user.patient_id && localViewMode === "personal") {
      setIsPatient(true);
      setPatientId(user.patient_id || "");
    } else {
      setIsPatient(false);
    }
  }, [localViewMode]);

  useEffect(() => {
    if (patientId) loadTree(patientId);
  }, [patientId, language]);



  async function loadTree(pid: string) {
    setLoading(true); setError(null); setData(null);
    try {
      const result = await api.request<APIFamilyResponse>(
        `/patients/${encodeURIComponent(pid)}/family-disease-history?max_depth=5`
      );
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("failedToLoadFamilyTree"));
    } finally {
      setLoading(false);
    }
  }

  /* Group members into generations */
  const generations: Record<Generation, FamilyNode[]> = {
    grandparents: [],
    parents: [],
    self: [],
    children: [],
  };

  if (data) {
    // Add self node
      generations.self.push({
        id: data.patient_id,
        name: data.patient_name,
        label: tr("you"),
      hasDiseases: false,
      diseaseCount: 0,
      isSelf: true,
      isBlood: true,
    });

    for (const rel of data.family_tree ?? []) {
      if (rel.patient_id === data.patient_id) continue;
      const gen = classifyGeneration(rel.relationship_to_searched_patient || rel.relationship_type);
      generations[gen].push({
        id: rel.patient_id,
        name: rel.name,
        label: rel.relationship_to_searched_patient || rel.relationship_type,
        hasDiseases: (rel.total_diseases ?? 0) > 0,
        diseaseCount: rel.total_diseases ?? 0,
        isSelf: false,
        isBlood: !["spouse", "husband", "wife"].includes(
          (rel.relationship_to_searched_patient || rel.relationship_type || "").toLowerCase()
        ),
      });
    }
  }

  const activeGenerations = (["grandparents", "parents", "self", "children"] as Generation[]).filter(
    (g) => generations[g].length > 0
  );

  const risks = data ? computeRisks(data.family_tree ?? []) : [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      <PageHeader
        title={isPatient ? tr("myFamilyTree") : tr("familyTreeAndRisk")}
        subtitle={isPatient ? tr("myFamilyTreeSubtitle") : tr("familyTreeSubtitle")}
        icon={<GitBranch size={20} />}
        right={
          <div className="flex flex-col md:flex-row items-end md:items-center gap-4">
            {!isPatient && (
              <div className="flex items-center gap-2 overflow-visible relative z-40">
                <PatientSearch onSelect={(id) => setPatientId(id)} className="w-64" />
              </div>
            )}

            {getUser()?.roles.includes("doctor") && getUser()?.patient_id && (
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

      {error && <div className="alert-error">{error}</div>}

      {loading && (
        <div className="flex items-center justify-center h-64 w-full">
          <Loader2 size={32} className="animate-spin text-primary" />
        </div>
      )}

      {/* ── FAMILY HIERARCHY TREE ── */}
      {data && activeGenerations.length > 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="card p-6"
        >
          <div className="flex items-center gap-2 mb-6">
            <Users size={18} className="text-primary" />
            <h2 className="text-base font-semibold">{tr("familyHierarchy")}</h2>
            <span className="text-xs text-muted ml-auto">{data.total_blood_relatives} {tr("relatives")}</span>
          </div>

          <div className="flex flex-col items-center gap-0">
            {activeGenerations.map((gen, genIdx) => {
              const meta = generationMeta[gen];
              const Icon = meta.icon;
              const members = generations[gen];

              return (
                <div key={gen} className="flex flex-col items-center w-full">
                  {/* Vertical connector from previous generation */}
                  {genIdx > 0 && (
                    <div className="w-px h-8 bg-gradient-to-b from-primary/40 to-primary/20" />
                  )}

                  {/* Generation label */}
                  <div className="flex items-center gap-1.5 text-xs font-medium text-muted mb-3 px-3 py-1 rounded-full bg-primary/5 border border-primary/10">
                    <Icon size={12} />
                    {tr(meta.labelKey)}
                  </div>

                  {/* Members row */}
                  <div className="flex flex-wrap justify-center gap-3 mb-2">
                    {members.map((member, mIdx) => (
                      <motion.div
                        key={member.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: genIdx * 0.1 + mIdx * 0.05 }}
                        className={`
                          relative flex flex-col items-center px-5 py-3 rounded-2xl border-2 transition-all duration-200
                          min-w-[140px] max-w-[180px]
                          ${member.isSelf
                            ? "bg-gradient-to-br from-primary to-primary/80 border-primary text-white shadow-lg shadow-primary/20 scale-105"
                            : member.hasDiseases
                              ? "bg-red-500/5 border-red-500/40 hover:border-red-500/60 hover:shadow-md"
                              : "bg-card border-border hover:border-primary/30 hover:shadow-md"
                          }
                        `}
                      >
                        {/* Disease indicator dot */}
                        {member.hasDiseases && !member.isSelf && (
                          <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
                            <span className="text-[9px] font-bold text-white">{member.diseaseCount}</span>
                          </div>
                        )}

                        <span className={`text-sm font-semibold text-center leading-tight ${member.isSelf ? "text-white" : ""}`}>
                          {member.name}
                        </span>
                        <span className={`text-[11px] mt-1 ${member.isSelf ? "text-white/70" : "text-muted"}`}>
                          {member.label}
                        </span>
                        {!member.isBlood && (
                          <span className="text-[9px] mt-0.5 px-1.5 py-0.5 rounded bg-white/10 text-muted">
                            {tr("nonBlood")}
                          </span>
                        )}
                      </motion.div>
                    ))}
                  </div>

                  {/* Horizontal spread lines to members if more than 1 */}
                  {members.length > 1 && genIdx < activeGenerations.length - 1 && (
                    <div className="w-1/2 max-w-xs h-px bg-primary/15 mb-1" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="mt-6 pt-4 border-t border-border flex flex-wrap gap-4 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-full bg-gradient-to-r from-primary to-primary/80" /> {tr("you")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded border border-border bg-card" /> {tr("healthy")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded border-2 border-red-500/40 bg-red-500/5" /> {tr("hasDiseases")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-5 rounded bg-red-500 text-white text-[8px] text-center leading-[12px] font-bold">2</span> {tr("diseaseCount")}
            </span>
          </div>
        </motion.div>
      )}

      {/* ── HEREDITARY DISEASE RISK ── */}
      {data && risks.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="card p-6"
        >
          <div className="flex items-center gap-2 mb-2">
            <Dna size={18} className="text-primary" />
            <h2 className="text-base font-semibold">{tr("hereditaryRisk")}</h2>
          </div>
          <p className="text-xs text-muted mb-5">
            {tr("hereditaryRiskHelp")}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {risks.map((risk, idx) => {
              const colors = riskColors[risk.riskLevel];
              return (
                <motion.div
                  key={risk.disease}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.4 + idx * 0.08 }}
                  className={`rounded-2xl border ${colors.border} ${colors.bg} p-4`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {risk.riskLevel === "high" ? (
                        <ShieldAlert size={18} className={colors.text} />
                      ) : risk.riskLevel === "moderate" ? (
                        <AlertTriangle size={18} className={colors.text} />
                      ) : (
                        <HeartPulse size={18} className={colors.text} />
                      )}
                      <span className="font-semibold capitalize text-sm">{risk.disease}</span>
                    </div>
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${colors.bg} ${colors.text} border ${colors.border}`}>
                      {risk.riskLevel} {tr("risk")}
                    </span>
                  </div>

                  {/* Risk bar */}
                  <div className="h-1.5 w-full rounded-full bg-black/5 mb-3">
                    <div
                      className={`h-full rounded-full ${colors.bar} transition-all duration-500`}
                      style={{ width: `${Math.min(100, risk.bloodRelativeCount * 25)}%` }}
                    />
                  </div>

                  {/* Affected relatives */}
                  <div className="space-y-1">
                    <span className="text-[10px] font-medium text-muted uppercase tracking-wider">
                      {risk.bloodRelativeCount} {tr("affectedRelatives")}
                    </span>
                    {risk.affectedRelatives.map((ar, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <Heart size={10} className={colors.text} />
                        <span className="font-medium">{ar.name}</span>
                        <span className="text-muted">({ar.relationship})</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Summary banner */}
          <div className="mt-5 rounded-xl bg-primary/5 border border-primary/15 p-4 flex items-start gap-3">
            <Dna size={20} className="text-primary mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium mb-1">{tr("whatDoesThisMean")}</p>
              <p className="text-muted text-xs leading-relaxed">
                {tr("hereditaryRiskDisclaimer")}
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Empty state */}
      {!data && !loading && !error && (
        <div className="card p-8 text-center text-muted">
          {isPatient
            ? tr("loadingFamilyTree")
            : tr("enterPatientIdFamilyTree")}
        </div>
      )}

      {data && risks.length === 0 && !loading && (
        <div className="card p-6 text-center">
          <Heart size={32} className="mx-auto mb-3 text-emerald-500" />
          <p className="font-medium text-sm">{tr("noHereditaryRisk")}</p>
          <p className="text-xs text-muted mt-1">{tr("noHereditaryRiskSubtitle")}</p>
        </div>
      )}
    </motion.div>
  );
}
