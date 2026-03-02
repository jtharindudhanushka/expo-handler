"use client";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase";

interface Company { id: string; name: string; room_number: string; interview_date: string }
interface UserProfile {
    id: string;
    full_name: string;
    email: string;
    role: "admin" | "room_lead";
    company_id: string | null;
    created_at: string;
    company?: Company | null;
}

const ROLES = ["admin", "room_lead"] as const;

export default function UsersPage() {
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [companies, setCompanies] = useState<Company[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editUser, setEditUser] = useState<UserProfile | null>(null);
    const [form, setForm] = useState({ full_name: "", email: "", password: "", role: "room_lead" as "admin" | "room_lead", company_id: "" });
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const supabase = createClient();

    const fetchData = useCallback(async () => {
        setLoading(true);
        const [{ data: usersData }, { data: companiesData }] = await Promise.all([
            supabase
                .from("profiles")
                .select("id, full_name, email, role, company_id, created_at, company:companies(id, name, room_number, interview_date)")
                .order("created_at", { ascending: false }),
            supabase.from("companies").select("*").order("name"),
        ]);
        // Supabase returns the join as an array; normalise to single object
        const normalised = (usersData || []).map((u: Record<string, unknown>) => ({
            ...u,
            company: Array.isArray(u.company) ? u.company[0] ?? null : u.company ?? null,
        })) as UserProfile[];
        setUsers(normalised);
        setCompanies(companiesData || []);
        setLoading(false);
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const resetForm = () => {
        setForm({ full_name: "", email: "", password: "", role: "room_lead", company_id: "" });
        setEditUser(null);
        setFormError(null);
        setShowForm(false);
    };

    const openEdit = (u: UserProfile) => {
        setEditUser(u);
        setForm({ full_name: u.full_name, email: u.email, password: "", role: u.role, company_id: u.company_id || "" });
        setShowForm(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setFormError(null);

        const companyId = form.company_id || null;

        if (editUser) {
            const { error } = await supabase.from("profiles").update({
                full_name: form.full_name,
                role: form.role,
                company_id: companyId,
            }).eq("id", editUser.id);
            if (error) { setFormError(error.message); setSaving(false); return; }
        } else {
            const res = await fetch("/api/admin/users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...form, company_id: companyId }),
            });
            const result = await res.json();
            if (!res.ok) { setFormError(result.error || "Failed to create user"); setSaving(false); return; }
        }

        await fetchData();
        resetForm();
        setSaving(false);
    };

    const handleDelete = async (u: UserProfile) => {
        if (!confirm(`Delete user ${u.full_name}? This will permanently remove their account.`)) return;
        await fetch(`/api/admin/users?id=${u.id}`, { method: "DELETE" });
        setUsers(prev => prev.filter(x => x.id !== u.id));
    };

    const roleBadge = (role: string) => (
        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${role === "admin" ? "bg-red-500/20 text-red-300" : "bg-indigo-500/20 text-indigo-300"}`}>
            {role === "admin" ? "Admin" : "Room Lead"}
        </span>
    );

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-black text-white">User Management</h1>
                    <p className="text-slate-400 mt-1">Manage admin and room lead accounts. Each room lead is assigned to one company.</p>
                </div>
                <button
                    onClick={() => { resetForm(); setShowForm(true); }}
                    className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold text-sm shadow-lg shadow-indigo-500/20 transition-all"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                    Add User
                </button>
            </div>

            {/* Form Modal */}
            {showForm && (
                <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
                        <h2 className="text-lg font-bold text-white mb-5">{editUser ? "Edit User" : "Create User"}</h2>
                        <form onSubmit={handleSave} className="space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-slate-300 mb-1.5">Full Name</label>
                                <input required value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                                    className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                                    placeholder="Full name" />
                            </div>
                            {!editUser && (
                                <>
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-300 mb-1.5">Email Address</label>
                                        <input required type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                                            className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                                            placeholder="user@example.com" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-300 mb-1.5">Password</label>
                                        <input required type="password" minLength={6} value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                                            className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                                            placeholder="Min. 6 characters" />
                                    </div>
                                </>
                            )}
                            <div>
                                <label className="block text-sm font-semibold text-slate-300 mb-1.5">Role</label>
                                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as "admin" | "room_lead", company_id: e.target.value === "admin" ? "" : f.company_id }))}
                                    className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm">
                                    {ROLES.map(r => <option key={r} value={r}>{r === "admin" ? "Admin" : "Room Lead"}</option>)}
                                </select>
                            </div>
                            {/* Company assignment — only for room leads */}
                            {form.role === "room_lead" && (
                                <div>
                                    <label className="block text-sm font-semibold text-slate-300 mb-1.5">
                                        Assigned Company / Room
                                        <span className="ml-1 text-slate-500 font-normal">(required for room leads)</span>
                                    </label>
                                    <select
                                        value={form.company_id}
                                        onChange={e => setForm(f => ({ ...f, company_id: e.target.value }))}
                                        className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                                    >
                                        <option value="">-- Select company --</option>
                                        {companies.map(c => (
                                            <option key={c.id} value={c.id}>
                                                {c.name} · {c.room_number} ({c.interview_date === "2026-03-03" ? "Mar 3" : "Mar 4"})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            {formError && <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-xl">{formError}</div>}
                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={resetForm} className="flex-1 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-semibold text-sm transition-all">Cancel</button>
                                <button type="submit" disabled={saving} className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold text-sm disabled:opacity-60 transition-all">
                                    {saving ? "Saving..." : (editUser ? "Update" : "Create User")}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {loading ? (
                <div className="text-slate-400 text-center py-20">Loading users...</div>
            ) : (
                <div className="bg-slate-900 border border-slate-700/50 rounded-2xl overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-700/50">
                                <th className="text-left px-4 py-3 text-slate-400 font-semibold">Name</th>
                                <th className="text-left px-4 py-3 text-slate-400 font-semibold">Role</th>
                                <th className="text-left px-4 py-3 text-slate-400 font-semibold">Assigned Room</th>
                                <th className="text-left px-4 py-3 text-slate-400 font-semibold hidden sm:table-cell">Added</th>
                                <th className="text-right px-4 py-3 text-slate-400 font-semibold">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map((u, i) => (
                                <tr key={u.id} className={`border-b border-slate-700/30 hover:bg-slate-800/50 transition-colors ${i % 2 === 0 ? "" : "bg-slate-800/20"}`}>
                                    <td className="px-4 py-3">
                                        <p className="text-white font-semibold">{u.full_name}</p>
                                        <p className="text-slate-500 text-xs">{u.email}</p>
                                    </td>
                                    <td className="px-4 py-3">{roleBadge(u.role)}</td>
                                    <td className="px-4 py-3">
                                        {u.role === "room_lead" ? (
                                            u.company ? (
                                                <div>
                                                    <p className="text-slate-300 text-sm font-medium">{(u.company as Company).name}</p>
                                                    <p className="text-slate-500 text-xs">{(u.company as Company).room_number}</p>
                                                </div>
                                            ) : (
                                                <span className="text-amber-500 text-xs font-semibold">⚠ Not assigned</span>
                                            )
                                        ) : (
                                            <span className="text-slate-600 text-xs">—</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-slate-400 text-xs hidden sm:table-cell">
                                        {new Date(u.created_at).toLocaleDateString()}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <button onClick={() => openEdit(u)} className="px-3 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors font-medium">Edit</button>
                                            <button onClick={() => handleDelete(u)} className="px-3 py-1 text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors font-medium">Delete</button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {users.length === 0 && <div className="text-center py-12 text-slate-500">No users found.</div>}
                </div>
            )}
        </div>
    );
}
