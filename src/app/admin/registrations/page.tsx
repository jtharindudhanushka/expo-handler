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
    const [deleting, setDeleting] = useState<string | null>(null);
    const supabase = createClient();

    const fetchRegistrations = useCallback(async () => {
        setLoading(true);
        const { data } = await supabase
            .from("registrations")
            .select("*")
            .order("created_at", { ascending: false });
        setRegistrations(data || []);
        setLoading(false);
    }, []);

    useEffect(() => { fetchRegistrations(); }, [fetchRegistrations]);

    const handleDelete = async (id: string) => {
        if (!confirm("Delete this registration?")) return;
        setDeleting(id);
        await supabase.from("registrations").delete().eq("id", id);
        setRegistrations(prev => prev.filter(r => r.id !== id));
        setDeleting(null);
    };

    const filtered = registrations.filter(r =>
        r.full_name?.toLowerCase().includes(search.toLowerCase()) ||
        r.email?.toLowerCase().includes(search.toLowerCase()) ||
        r.student_number?.toLowerCase().includes(search.toLowerCase()) ||
        r.university?.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-white">Registrations</h1>
                    <p className="text-slate-400 mt-1">{registrations.length} total candidates registered</p>
                </div>
                <input
                    type="text"
                    placeholder="Search by name, email, student ID..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full sm:w-72 text-sm"
                />
            </div>

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
                                    <th className="text-left px-4 py-3 text-slate-400 font-semibold">Name</th>
                                    <th className="text-left px-4 py-3 text-slate-400 font-semibold">University</th>
                                    <th className="text-left px-4 py-3 text-slate-400 font-semibold">Student #</th>
                                    <th className="text-left px-4 py-3 text-slate-400 font-semibold">Faculty</th>
                                    <th className="text-left px-4 py-3 text-slate-400 font-semibold">Level</th>
                                    <th className="text-left px-4 py-3 text-slate-400 font-semibold">Mar 3</th>
                                    <th className="text-left px-4 py-3 text-slate-400 font-semibold">Mar 4</th>
                                    <th className="text-right px-4 py-3 text-slate-400 font-semibold">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((r, i) => (
                                    <tr key={r.id} className={`border-b border-slate-700/30 hover:bg-slate-800/50 transition-colors ${i % 2 === 0 ? "" : "bg-slate-800/20"}`}>
                                        <td className="px-4 py-3">
                                            <button onClick={() => setSelected(r)} className="text-indigo-400 hover:text-indigo-300 font-semibold text-left">
                                                {r.full_name}
                                            </button>
                                            <div className="text-slate-500 text-xs mt-0.5">{r.email}</div>
                                        </td>
                                        <td className="px-4 py-3 text-slate-300 max-w-[120px] truncate">{r.university}</td>
                                        <td className="px-4 py-3 text-slate-300">{r.student_number}</td>
                                        <td className="px-4 py-3 text-slate-300 max-w-[100px] truncate">{r.faculty}</td>
                                        <td className="px-4 py-3">
                                            <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 rounded-full text-xs font-semibold">{r.level}</span>
                                        </td>
                                        <td className="px-4 py-3 text-slate-300 max-w-[140px] truncate text-xs">{r.companies_march3}</td>
                                        <td className="px-4 py-3 text-slate-300 max-w-[140px] truncate text-xs">{r.companies_march4}</td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button onClick={() => setSelected(r)} className="px-3 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors font-medium">View</button>
                                                <button
                                                    onClick={() => handleDelete(r.id)}
                                                    disabled={deleting === r.id}
                                                    className="px-3 py-1 text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors font-medium"
                                                >
                                                    {deleting === r.id ? "..." : "Delete"}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
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
