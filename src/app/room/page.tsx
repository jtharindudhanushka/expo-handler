"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";

interface Company { id: string; name: string; interview_date: string }
interface Registration { id: string; full_name: string; student_number: string; email: string; level: string }
interface Ticket {
    id: string; status: string; position: number; created_at: string;
    registration_id: string;
    registration?: Registration;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
    pending: { label: "WAITING", color: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
    called: { label: "CALLED", color: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
    interviewing: { label: "INTERVIEWING", color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
};

export default function RoomLeadDashboard() {
    const [companies, setCompanies] = useState<Company[]>([]);
    const [selectedCompany, setSelectedCompany] = useState("");
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [skippedTickets, setSkippedTickets] = useState<Ticket[]>([]);
    const [loading, setLoading] = useState(true);
    const [profile, setProfile] = useState<{ full_name: string; role: string; company_id: string | null } | null>(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [conflict, setConflict] = useState<{ ticketId: string; msg: string } | null>(null);
    const router = useRouter();
    const supabase = createClient();
    const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

    useEffect(() => {
        const init = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { router.push("/login"); return; }
            const { data: p } = await supabase.from("profiles").select("full_name, role, company_id").eq("id", user.id).single();
            setProfile(p);
            if (p?.role !== "room_lead" && p?.role !== "admin") { router.push("/login"); return; }

            const admin = p?.role === "admin";
            setIsAdmin(admin);

            if (admin) {
                const { data: comps } = await supabase.from("companies").select("*").order("name");
                setCompanies(comps || []);
            } else {
                if (p?.company_id) {
                    const { data: comp } = await supabase.from("companies").select("*").eq("id", p.company_id).single();
                    if (comp) { setCompanies([comp]); setSelectedCompany(comp.id); }
                }
            }
            setLoading(false);
        };
        init();
    }, []);

    const fetchTickets = useCallback(async () => {
        if (!selectedCompany) { setTickets([]); return; }
        const { data } = await supabase
            .from("queue_tickets")
            .select("id, status, position, created_at, registration_id, registration:registrations(id, full_name, student_number, email, level)")
            .eq("company_id", selectedCompany)
            .in("status", ["pending", "called", "interviewing"])
            .order("position", { ascending: true });
        setTickets((data || []) as unknown as Ticket[]);

        // Also fetch skipped/no-show tickets for the recall section
        const { data: skipped } = await supabase
            .from("queue_tickets")
            .select("id, status, position, created_at, registration_id, registration:registrations(id, full_name, student_number, email, level)")
            .eq("company_id", selectedCompany)
            .in("status", ["skipped"])
            .order("position", { ascending: true });
        setSkippedTickets((skipped || []) as unknown as Ticket[]);
    }, [selectedCompany]);

    useEffect(() => { fetchTickets(); }, [fetchTickets]);

    // Real-time subscription — recreate when company changes
    useEffect(() => {
        if (!selectedCompany) return;
        if (channelRef.current) channelRef.current.unsubscribe();

        const channel = supabase
            .channel(`room-${selectedCompany}-${Date.now()}`)
            .on("postgres_changes", {
                event: "*", schema: "public", table: "queue_tickets",
                filter: `company_id=eq.${selectedCompany}`,
            }, () => fetchTickets())
            .subscribe();

        channelRef.current = channel;
        return () => { channel.unsubscribe(); };
    }, [selectedCompany, fetchTickets]);

    /**
     * Check if a registration is currently being called or interviewed at another company.
     * Returns the conflicting company name, or null if clear.
     */
    const checkConflict = async (registrationId: string, currentTicketId: string): Promise<string | null> => {
        const { data } = await supabase
            .from("queue_tickets")
            .select("id, status, company:companies(name)")
            .eq("registration_id", registrationId)
            .in("status", ["called", "interviewing"])
            .neq("id", currentTicketId);

        if (data && data.length > 0) {
            const t = data[0] as unknown as { company?: { name: string }; status: string };
            return `${t.company?.name} (${t.status})`;
        }
        return null;
    };

    /**
     * Recall a skipped/no-show ticket:
     * Assigns a new position at the END of the current queue and sets back to pending.
     */
    const recallTicket = async (ticket: Ticket) => {
        setConflict(null);
        const { data: maxData } = await supabase
            .from("queue_tickets")
            .select("position")
            .eq("company_id", selectedCompany)
            .order("position", { ascending: false })
            .limit(1);
        const maxPos = maxData?.[0]?.position ?? 0;
        await supabase
            .from("queue_tickets")
            .update({ status: "pending", position: maxPos + 1 })
            .eq("id", ticket.id);
        await fetchTickets();
    };

    const updateStatus = async (ticket: Ticket, newStatus: string) => {
        setConflict(null);

        // Conflict check: if calling or starting interview, ensure candidate isn't elsewhere
        if (newStatus === "called" || newStatus === "interviewing") {
            const conflictAt = await checkConflict(ticket.registration_id, ticket.id);
            if (conflictAt) {
                setConflict({
                    ticketId: ticket.id,
                    msg: `${ticket.registration?.full_name} is already ${newStatus === "called" ? "active" : "being interviewed"} at ${conflictAt}. Cannot call them here simultaneously.`,
                });
                return;
            }
        }

        await supabase.from("queue_tickets").update({ status: newStatus }).eq("id", ticket.id);
        await fetchTickets();
    };

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        router.push("/login");
    };

    if (loading) return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
            <div className="text-slate-400 animate-pulse">Loading...</div>
        </div>
    );

    const activeTicket = tickets.find(t => t.status === "interviewing");
    const calledTicket = tickets.find(t => t.status === "called");
    const queueTickets = tickets.filter(t => t.status === "pending");
    const selectedComp = companies.find(c => c.id === selectedCompany);

    return (
        <div className="min-h-screen bg-slate-950 font-sans">
            {/* Header */}
            <header className="bg-slate-900 border-b border-slate-700/50 px-4 md:px-8 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    </div>
                    <div>
                        <p className="text-white font-bold text-sm">Room Lead Dashboard</p>
                        {profile && <p className="text-slate-400 text-xs">{profile.full_name}</p>}
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <a href="/display" target="_blank" className="text-xs text-slate-500 hover:text-slate-300 hidden sm:block transition-colors">Display Board ↗</a>
                    <button onClick={handleSignOut} className="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-all">Sign Out</button>
                </div>
            </header>

            <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
                {/* Conflict warning */}
                {conflict && (
                    <div className="bg-red-500/10 border border-red-500/40 rounded-2xl p-4 flex items-start gap-3">
                        <span className="text-red-400 text-xl mt-0.5">⚠</span>
                        <div>
                            <p className="text-red-300 font-bold text-sm">Conflict Detected</p>
                            <p className="text-slate-400 text-sm mt-0.5">{conflict.msg}</p>
                            <button onClick={() => setConflict(null)} className="text-xs text-slate-500 hover:text-slate-300 mt-2 transition-colors">Dismiss</button>
                        </div>
                    </div>
                )}

                {/* Company display */}
                {isAdmin ? (
                    <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-5">
                        <label className="block text-sm font-semibold text-slate-300 mb-3">Select Company (Admin View)</label>
                        <select value={selectedCompany} onChange={e => setSelectedCompany(e.target.value)}
                            className="w-full h-12 px-4 bg-slate-800 border border-slate-600 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium">
                            <option value="">-- Select Company --</option>
                            {companies.map(c => (
                                <option key={c.id} value={c.id}>{c.name} ({c.interview_date === "2026-03-03" ? "Mar 3" : "Mar 4"})</option>
                            ))}
                        </select>
                    </div>
                ) : profile?.company_id ? (
                    companies.length > 0 && (
                        <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-2xl p-5 flex items-center justify-between">
                            <div>
                                <p className="text-xs text-indigo-400 font-semibold uppercase tracking-wide mb-1">Your Assigned Company</p>
                                <p className="text-white text-xl font-black">{companies[0].name}</p>
                                <p className="text-slate-400 text-sm">{companies[0].interview_date === "2026-03-03" ? "March 3" : "March 4"}</p>
                            </div>
                            <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center">
                                <svg className="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                </svg>
                            </div>
                        </div>
                    )
                ) : (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-6 text-center">
                        <p className="text-amber-400 font-bold text-lg mb-1">⚠ No Company Assigned</p>
                        <p className="text-slate-400 text-sm">Please ask an admin to assign you to a company in User Management.</p>
                    </div>
                )}

                {selectedCompany && (
                    <>
                        {/* Status summary */}
                        <div className="grid grid-cols-3 gap-3">
                            {[
                                { label: "In Interview", value: activeTicket ? 1 : 0, color: "text-emerald-400" },
                                { label: "Called / Ready", value: calledTicket ? 1 : 0, color: "text-blue-400" },
                                { label: "Waiting", value: queueTickets.length, color: "text-amber-400" },
                            ].map(s => (
                                <div key={s.label} className="bg-slate-900 border border-slate-700/50 rounded-xl p-4 text-center">
                                    <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
                                    <div className="text-slate-400 text-xs mt-0.5">{s.label}</div>
                                </div>
                            ))}
                        </div>

                        {/* Currently interviewing */}
                        {activeTicket && (
                            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-6">
                                <div className="flex items-center gap-2 mb-4">
                                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                    <span className="text-emerald-400 font-bold text-sm uppercase tracking-wide">Currently Interviewing</span>
                                </div>
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <h2 className="text-white text-2xl font-black">{activeTicket.registration?.full_name}</h2>
                                        <p className="text-slate-400 text-sm mt-1">{activeTicket.registration?.student_number} · {activeTicket.registration?.level}</p>
                                    </div>
                                    <button onClick={() => updateStatus(activeTicket, "completed")}
                                        className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-sm shadow-lg shadow-emerald-600/20 transition-all whitespace-nowrap">
                                        ✓ Mark Complete
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Called / ready to enter */}
                        {calledTicket && (
                            <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-5">
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                                    <span className="text-blue-400 font-bold text-sm uppercase tracking-wide">Called — Proceeding to Room</span>
                                </div>
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <p className="text-white font-bold">{calledTicket.registration?.full_name}</p>
                                        <p className="text-slate-400 text-xs">{calledTicket.registration?.student_number}</p>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => updateStatus(calledTicket, "interviewing")} disabled={!!activeTicket}
                                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl font-semibold text-sm transition-all">
                                            Start Interview
                                        </button>
                                        <button onClick={() => updateStatus(calledTicket, "skipped")}
                                            className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl text-sm transition-all">
                                            No Show
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Queue list */}
                        <div className="bg-slate-900 border border-slate-700/50 rounded-2xl overflow-hidden">
                            <div className="px-5 py-4 border-b border-slate-700/50 flex items-center justify-between">
                                <h3 className="text-white font-bold">
                                    Queue — {selectedComp?.name}
                                </h3>
                                <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 text-xs font-bold rounded-full">{queueTickets.length} waiting</span>
                            </div>
                            <div className="divide-y divide-slate-700/30">
                                {queueTickets.length === 0 ? (
                                    <div className="text-center py-12 text-slate-500 text-sm">Queue is empty.</div>
                                ) : queueTickets.map((ticket, i) => (
                                    <div key={ticket.id} className={`flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 gap-4 ${i === 0 ? "bg-white/5" : ""}`}>
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-slate-300 font-bold text-sm flex-shrink-0">
                                                {i + 1}
                                            </div>
                                            <div>
                                                <p className="text-white font-semibold">{ticket.registration?.full_name}</p>
                                                <p className="text-slate-400 text-xs">{ticket.registration?.student_number} · {ticket.registration?.level}</p>
                                            </div>
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${STATUS_CONFIG[ticket.status]?.color}`}>
                                                {STATUS_CONFIG[ticket.status]?.label}
                                            </span>
                                        </div>
                                        <div className="flex gap-2 w-full sm:w-auto">
                                            {/* Allow calling next even if someone else is being interviewed — reduces wait */}
                                            {!calledTicket && (
                                                <button onClick={() => updateStatus(ticket, "called")}
                                                    className="flex-1 sm:flex-none px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold text-sm transition-all">
                                                    Call to Room
                                                </button>
                                            )}
                                            <button onClick={() => updateStatus(ticket, "skipped")}
                                                className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl font-semibold text-sm transition-all">
                                                Skip
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Skipped / No-Show — Recall section */}
                        {skippedTickets.length > 0 && (
                            <div className="bg-slate-900 border border-slate-700/50 rounded-2xl overflow-hidden opacity-80">
                                <div className="px-5 py-3 border-b border-slate-700/50 flex items-center justify-between">
                                    <h3 className="text-slate-400 font-bold text-sm">Skipped / No Show</h3>
                                    <span className="px-2 py-0.5 bg-slate-700 text-slate-400 text-xs font-bold rounded-full">{skippedTickets.length}</span>
                                </div>
                                <div className="divide-y divide-slate-700/30">
                                    {skippedTickets.map(ticket => (
                                        <div key={ticket.id} className="flex items-center justify-between p-4 gap-4">
                                            <div>
                                                <p className="text-slate-300 font-semibold text-sm">{ticket.registration?.full_name}</p>
                                                <p className="text-slate-500 text-xs">{ticket.registration?.student_number} · {ticket.registration?.level}</p>
                                            </div>
                                            <button
                                                onClick={() => recallTicket(ticket)}
                                                className="px-3 py-1.5 bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 text-amber-300 rounded-xl font-semibold text-xs transition-all whitespace-nowrap"
                                            >
                                                ↩ Recall
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
