"use client";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase";

interface Registration {
    id: string;
    full_name: string;
    university: string;
    student_number: string;
    email: string;
    contact_number: string;
    faculty: string;
    level: string;
    department: string;
    employment_type: string;
    companies_march3: string;
    companies_march4: string;
    job_opportunities: string;
    cv_link: string;
    created_at: string;
}

export default function RegistrationsPage() {
    const [registrations, setRegistrations] = useState<Registration[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState<Registration | null>(null);
    const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
    const [bulkDeleting, setBulkDeleting] = useState(false);
    const [allocating, setAllocating] = useState(false);
    const [allocResult, setAllocResult] = useState<{ ticketsCreated: number; companiesProcessed: number } | null>(null);
    const supabase = createClient();

    const fetchRegistrations = useCallback(async () => {
        setLoading(true);
        const { data } = await supabase
            .from("registrations")
            .select("*")
            .order("created_at", { ascending: true }); // ascending: earliest first
        setRegistrations(data || []);
        setLoading(false);
    }, []);

    useEffect(() => { fetchRegistrations(); }, [fetchRegistrations]);

    const filtered = registrations.filter(r =>
        r.full_name?.toLowerCase().includes(search.toLowerCase()) ||
        r.email?.toLowerCase().includes(search.toLowerCase()) ||
        r.student_number?.toLowerCase().includes(search.toLowerCase()) ||
        r.university?.toLowerCase().includes(search.toLowerCase())
    );

    // ── Selection helpers ──────────────────────────────────────────────
    const allFilteredChecked = filtered.length > 0 && filtered.every(r => checkedIds.has(r.id));
    const someChecked = checkedIds.size > 0;

    const toggleAll = () => {
        if (allFilteredChecked) {
            setCheckedIds(prev => { const n = new Set(prev); filtered.forEach(r => n.delete(r.id)); return n; });
        } else {
            setCheckedIds(prev => { const n = new Set(prev); filtered.forEach(r => n.add(r.id)); return n; });
        }
    };

    const toggleOne = (id: string) => {
        setCheckedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    };

    // ── Bulk delete ────────────────────────────────────────────────────
    const handleBulkDelete = async () => {
        if (!confirm(`Delete ${checkedIds.size} registration(s)? Their queue tickets will also be deleted.`)) return;
        setBulkDeleting(true);
        const ids = [...checkedIds];
        await supabase.from("registrations").delete().in("id", ids);
        setRegistrations(prev => prev.filter(r => !checkedIds.has(r.id)));
        setCheckedIds(new Set());
        setBulkDeleting(false);
    };

    // ── Single delete ──────────────────────────────────────────────────
    const handleDelete = async (id: string) => {
        if (!confirm("Delete this registration?")) return;
        await supabase.from("registrations").delete().eq("id", id);
        setRegistrations(prev => prev.filter(r => r.id !== id));
        setCheckedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    };

    // ── Re-allocate queue tickets ──────────────────────────────────────
    const handleReallocate = async () => {
        if (!confirm("Re-allocate ALL queue tickets? Active pending/called/interviewing tickets will be replaced with fresh ones ordered by registration time.")) return;
        setAllocating(true);
        setAllocResult(null);
        const res = await fetch("/api/admin/reallocate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
        const data = await res.json();
        setAllocResult(data);
        setAllocating(false);
    };

    return (
        <div className="space-y-6">
            {/* Header row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-white">Registrations</h1>
                    <p className="text-slate-400 mt-1">{registrations.length} total · sorted earliest first</p>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                    {/* Re-allocate button — always visible */}
                    <button
                        onClick={handleReallocate}
                        disabled={allocating || registrations.length === 0}
                        className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 rounded-xl font-semibold text-sm transition-all disabled:opacity-50"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        {allocating ? "Allocating..." : "Re-allocate Queue"}
                    </button>

                    {/* Bulk delete — only when items are selected */}
                    {someChecked && (
                        <button
                            onClick={handleBulkDelete}
                            disabled={bulkDeleting}
                            className="flex items-center gap-1.5 px-4 py-2 bg-red-600/20 hover:bg-red-600/30 border border-red-500/40 text-red-300 rounded-xl font-semibold text-sm transition-all disabled:opacity-50"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            {bulkDeleting ? "Deleting..." : `Delete ${checkedIds.size} selected`}
                        </button>
                    )}

                    <input
                        type="text"
                        placeholder="Search..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="px-4 py-2 bg-slate-800 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full sm:w-56 text-sm"
                    />
                </div>
            </div>

            {/* Allocation result banner */}
            {allocResult && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 flex items-center justify-between">
                    <div>
                        <p className="text-emerald-400 font-bold text-sm">✓ Queue Re-allocated</p>
                        <p className="text-slate-400 text-xs mt-0.5">
                            {allocResult.ticketsCreated} tickets created across {allocResult.companiesProcessed} companies, ordered by registration time.
                        </p>
                    </div>
                    <button onClick={() => setAllocResult(null)} className="text-slate-500 hover:text-slate-300 text-xs">Dismiss</button>
                </div>
            )}

            {loading ? (
                <div className="text-slate-400 text-center py-20">Loading registrations...</div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-20 text-slate-500">No registrations found.</div>
            ) : (
                <div className="bg-slate-900 border border-slate-700/50 rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-700/50">
                                    <th className="px-4 py-3 w-8">
                                        <input
                                            type="checkbox"
                                            checked={allFilteredChecked}
                                            onChange={toggleAll}
                                            className="accent-indigo-500 w-4 h-4 cursor-pointer"
                                        />
                                    </th>
                                    <th className="text-left px-4 py-3 text-slate-400 font-semibold">#</th>
                                    <th className="text-left px-4 py-3 text-slate-400 font-semibold">Name</th>
                                    <th className="text-left px-4 py-3 text-slate-400 font-semibold">University</th>
                                    <th className="text-left px-4 py-3 text-slate-400 font-semibold">Student #</th>
                                    <th className="text-left px-4 py-3 text-slate-400 font-semibold">Level</th>
                                    <th className="text-left px-4 py-3 text-slate-400 font-semibold">Mar 3</th>
                                    <th className="text-left px-4 py-3 text-slate-400 font-semibold">Mar 4</th>
                                    <th className="text-right px-4 py-3 text-slate-400 font-semibold">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((r, i) => (
                                    <tr
                                        key={r.id}
                                        className={`border-b border-slate-700/30 transition-colors ${checkedIds.has(r.id) ? "bg-indigo-500/10" : i % 2 === 0 ? "" : "bg-slate-800/20"} hover:bg-slate-800/40`}
                                    >
                                        <td className="px-4 py-3">
                                            <input
                                                type="checkbox"
                                                checked={checkedIds.has(r.id)}
                                                onChange={() => toggleOne(r.id)}
                                                className="accent-indigo-500 w-4 h-4 cursor-pointer"
                                            />
                                        </td>
                                        <td className="px-4 py-3 text-slate-500 text-xs tabular-nums">{i + 1}</td>
                                        <td className="px-4 py-3">
                                            <button onClick={() => setSelected(r)} className="text-indigo-400 hover:text-indigo-300 font-semibold text-left">
                                                {r.full_name}
                                            </button>
                                            <div className="text-slate-500 text-xs mt-0.5">{r.email}</div>
                                        </td>
                                        <td className="px-4 py-3 text-slate-300 max-w-[120px] truncate">{r.university}</td>
                                        <td className="px-4 py-3 text-slate-300">{r.student_number}</td>
                                        <td className="px-4 py-3">
                                            <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 rounded-full text-xs font-semibold">{r.level}</span>
                                        </td>
                                        <td className="px-4 py-3 text-slate-300 max-w-[140px] truncate text-xs">{r.companies_march3 || "—"}</td>
                                        <td className="px-4 py-3 text-slate-300 max-w-[140px] truncate text-xs">{r.companies_march4 || "—"}</td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button onClick={() => setSelected(r)} className="px-3 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors font-medium">View</button>
                                                <button onClick={() => handleDelete(r.id)} className="px-3 py-1 text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors font-medium">Del</button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {someChecked && (
                        <div className="px-4 py-3 border-t border-slate-700/50 bg-slate-800/50 flex items-center gap-3 text-xs text-slate-400">
                            <span className="font-semibold text-white">{checkedIds.size}</span> selected
                            <button onClick={() => setCheckedIds(new Set())} className="text-slate-500 hover:text-slate-300 transition-colors">Clear selection</button>
                        </div>
                    )}
                </div>
            )}

            {/* Detail Modal */}
            {selected && (
                <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-xl w-full shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="flex items-start justify-between mb-6">
                            <div>
                                <h2 className="text-xl font-black text-white">{selected.full_name}</h2>
                                <p className="text-slate-400 text-sm">{selected.email} · {selected.contact_number}</p>
                            </div>
                            <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-white p-1">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                            {[
                                ["University", selected.university],
                                ["Student Number", selected.student_number],
                                ["Faculty", selected.faculty],
                                ["Department", selected.department],
                                ["Level", selected.level],
                                ["Employment Type", selected.employment_type],
                                ["Mar 3 Companies", selected.companies_march3],
                                ["Mar 4 Companies", selected.companies_march4],
                                ["Job Opportunities", selected.job_opportunities],
                                ["CV Link", selected.cv_link],
                            ].map(([label, value]) => (
                                <div key={label} className="bg-slate-800 rounded-xl p-3">
                                    <p className="text-slate-400 text-xs mb-0.5">{label}</p>
                                    <p className="text-white font-medium text-xs break-words">{value || "—"}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
