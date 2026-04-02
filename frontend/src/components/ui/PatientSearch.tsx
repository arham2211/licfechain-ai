"use client";

import { useState, useEffect, useRef } from "react";
import { Search, User, Loader2 } from "lucide-react";
import { api } from "@/lib/api-client";

type Patient = {
    patient_id: string;
    first_name: string;
    last_name: string;
    cnic: string;
};

interface PatientSearchProps {
    onSelect: (patientId: string) => void;
    placeholder?: string;
    className?: string;
}

export function PatientSearch({ onSelect, placeholder = "Search patient by name or CNIC...", className = "" }: PatientSearchProps) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<Patient[]>([]);
    const [loading, setLoading] = useState(false);
    const [showResults, setShowResults] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setShowResults(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        if (query.length < 2) {
            setResults([]);
            return;
        }

        const timer = setTimeout(async () => {
            setLoading(true);
            try {
                const data = await api.request<Patient[]>(`/patients?search=${encodeURIComponent(query)}&limit=5`);
                setResults(data);
                setShowResults(true);
            } catch (err) {
                console.error("Failed to search patients", err);
            } finally {
                setLoading(false);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [query]);

    return (
        <div className={`relative ${className}`} ref={containerRef}>
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                    type="text"
                    className="input w-full"
                    style={{ paddingLeft: '2.75rem' }}
                    placeholder={placeholder}
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setShowResults(true);
                    }}
                    onFocus={() => setShowResults(true)}
                />
                {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-primary" size={18} />}
            </div>

            {showResults && results.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-[100] mt-2 max-h-72 overflow-y-auto rounded-xl border border-border bg-card-solid p-1 shadow-2xl animate-in fade-in slide-in-from-top-2">
                    {results.map((p) => (
                        <button
                            key={p.patient_id}
                            onClick={() => {
                                onSelect(p.patient_id);
                                setQuery(`${p.first_name} ${p.last_name}`);
                                setShowResults(false);
                            }}
                            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-slate-50 transition-colors"
                        >
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                                <User size={14} />
                            </div>
                            <div className="flex-1 overflow-hidden">
                                <p className="text-sm font-bold text-slate-800 truncate">
                                    {p.first_name} {p.last_name}
                                </p>
                                <p className="text-[10px] font-mono text-slate-400">CNIC: {p.cnic}</p>
                            </div>
                        </button>
                    ))}
                </div>
            )}

            {showResults && query.length >= 2 && !loading && results.length === 0 && (
                <div className="absolute left-0 right-0 top-full z-[100] mt-2 rounded-xl border border-border bg-card-solid p-4 text-center shadow-2xl animate-in fade-in">
                    <p className="text-sm text-slate-400 italic">No patients found matches "{query}"</p>
                </div>
            )}
        </div>
    );
}
