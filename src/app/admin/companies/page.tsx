"use client";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase";

interface Company {
    id: string;
    name: string;
    room_number: string;
    interview_date: string;
}

const emptyForm = { name: "", room_number: "", interview_date: "2026-03-03" };

export default function CompaniesPage() {
    const [companies, setCompanies] = useState<Company[]>([]);
    const [loading, setLoading] = useState(true);
    const [form, setForm] = useState(emptyForm);
    const [editing, setEditing] = useState<Company | null>(null);
    const [saving, setSaving] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const supabase = createClient();

    const fetchCompanies = useCallback(async () => {
        setLoading(true);
        const { data } = await supabase.from("companies").select("*").order("name");
        setCompanies(data || []);
        setLoading(false);
    }, []);

    useEffect(() => { fetchCompanies(); }, [fetchCompanies]);

    const openEdit = (c: Company) => {
        setEditing(c);
        setForm({ name: c.name, room_number: c.room_number, interview_date: c.interview_date });
        setShowForm(true);
    };

    const resetForm = () => {
        setForm(emptyForm);
        setEditing(null);
        setShowForm(false);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        if (editing) {
            await supabase.from("companies").update(form).eq("id", editing.id);
        } else {
            await supabase.from("companies").insert(form);
        }
        await fetchCompanies();
        resetForm();
        setSaving(false);
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Delete this company? Any associated queue tickets will also be removed.")) return;
        await supabase.from("companies").delete().eq("id", id);
        setCompanies(prev => prev.filter(c => c.id !== id));
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-black text-white">Companies & Rooms</h1>
                    <p className="text-slate-400 mt-1">Manage interview companies and room assignments</p>
                </div>
                <button
                    onClick={() => { resetForm(); setShowForm(true); }}
                    className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold text-sm shadow-lg shadow-indigo-500/20 transition-all"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    Add Company
                </button>
            </div>

            {/* Form modal */}
            {showForm && (
                <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
                        <h2 className="text-lg font-bold text-white mb-5">{editing ? "Edit Company" : "Add Company"}</h2>
                        <form onSubmit={handleSave} className="space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-slate-300 mb-1.5">Company Name</label>
                                <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                    className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                                    placeholder="e.g. Google Sri Lanka" />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-300 mb-1.5">Room Number</label>
                                <input required value={form.room_number} onChange={e => setForm(f => ({ ...f, room_number: e.target.value }))}
                                    className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                                    placeholder="e.g. Room A1" />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-300 mb-1.5">Interview Date</label>
                                <select value={form.interview_date} onChange={e => setForm(f => ({ ...f, interview_date: e.target.value }))}
                                    className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm">
                                    <option value="2026-03-03">March 3, 2026</option>
                                    <option value="2026-03-04">March 4, 2026</option>
                                </select>
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={resetForm} className="flex-1 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-semibold text-sm transition-all">Cancel</button>
                                <button type="submit" disabled={saving} className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold text-sm transition-all disabled:opacity-60">
                                    {saving ? "Saving..." : (editing ? "Update" : "Add Company")}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {loading ? (
                <div className="text-slate-400 text-center py-20">Loading companies...</div>
            ) : companies.length === 0 ? (
                <div className="text-center py-20">
                    <p className="text-slate-500">No companies added yet.</p>
                    <button onClick={() => setShowForm(true)} className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold">Add First Company</button>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {companies.map(c => (
                        <div key={c.id} className="bg-slate-900 border border-slate-700/50 rounded-2xl p-5 hover:border-slate-600 transition-all group">
                            <div className="flex items-start justify-between mb-3">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-black text-sm shadow-lg">
                                    {c.name.charAt(0)}
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => openEdit(c)} className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-all">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                    </button>
                                    <button onClick={() => handleDelete(c.id)} className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    </button>
                                </div>
                            </div>
                            <h3 className="text-white font-bold text-base">{c.name}</h3>
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                                <span className="px-2 py-0.5 bg-violet-500/20 text-violet-300 rounded-lg text-xs font-semibold">{c.room_number}</span>
                                <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded-lg text-xs font-semibold">
                                    {c.interview_date === "2026-03-03" ? "March 3" : "March 4"}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
