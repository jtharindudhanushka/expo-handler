"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { LogOut, MonitorUp, AlertCircle, CheckCircle2, Volume2, UserMinus, Plus, Sparkles, Building2 } from "lucide-react";

interface Company { id: string; name: string; interview_date: string }
interface Registration { id: string; full_name: string; student_number: string; email: string; level: string }
interface Ticket {
    id: string; status: string; position: number; created_at: string;
    registration_id: string;
    registration?: Registration;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; border: string }> = {
    pending: { label: "Waiting", color: "bg-gray-800/50 text-gray-400", border: "border-gray-800" },
    called: { label: "Called", color: "bg-blue-500/10 text-blue-400", border: "border-blue-500/20" },
    interviewing: { label: "In Session", color: "bg-green-500/10 text-green-400", border: "border-green-500/20" },
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
    }, [router, supabase]);

    const fetchTickets = useCallback(async () => {
        if (!selectedCompany) { setTickets([]); return; }
        const { data } = await supabase
            .from("queue_tickets")
            .select("id, status, position, created_at, registration_id, registration:registrations(id, full_name, student_number, email, level)")
            .eq("company_id", selectedCompany)
            .in("status", ["pending", "called", "interviewing"])
            .order("position", { ascending: true });
        setTickets((data || []) as unknown as Ticket[]);

        const { data: skipped } = await supabase
            .from("queue_tickets")
            .select("id, status, position, created_at, registration_id, registration:registrations(id, full_name, student_number, email, level)")
            .eq("company_id", selectedCompany)
            .in("status", ["skipped"])
            .order("position", { ascending: true });
        setSkippedTickets((skipped || []) as unknown as Ticket[]);
    }, [selectedCompany, supabase]);

    useEffect(() => { fetchTickets(); }, [fetchTickets]);

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
    }, [selectedCompany, fetchTickets, supabase]);

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

    const recallTicket = async (ticket: Ticket) => {
        setConflict(null);
        try {
            const res = await fetch("/api/room/update", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ticketId: ticket.id, newStatus: "pending", companyId: selectedCompany }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to recall ticket");
            await fetchTickets();
        } catch (err: any) {
            alert(`Error recalling ticket: ${err.message}`);
        }
    };

    const updateStatus = async (ticket: Ticket, newStatus: string) => {
        setConflict(null);

        if (newStatus === "called" || newStatus === "interviewing") {
            const conflictAt = await checkConflict(ticket.registration_id, ticket.id);
            if (conflictAt) {
                setConflict({
                    ticketId: ticket.id,
                    msg: `${ticket.registration?.full_name} is already active at ${conflictAt}. Cannot call them simultaneously.`,
                });
                return;
            }
        }

        try {
            const res = await fetch("/api/room/update", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ticketId: ticket.id, newStatus, companyId: selectedCompany }),
            });

            const data = await res.json();
            if (!res.ok) {
                if (data.code === "23505" || (data.error && data.error.includes("duplicate key value"))) {
                    setConflict({
                        ticketId: ticket.id,
                        msg: `${ticket.registration?.full_name} was just called by another room. Please refresh.`,
                    });
                } else {
                    alert(`Error updating status: ${data.error}`);
                }
            } else {
                await fetchTickets();
            }
        } catch (err: any) {
            console.error("Update error:", err);
            alert(`Error updating status: ${err.message}`);
        }
    };

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        router.push("/login");
    };

    if (loading) return (
        <div className="min-h-screen bg-[#0A0A0B] flex items-center justify-center">
            <div className="text-gray-500 font-medium flex items-center gap-3">
                <Sparkles className="w-5 h-5 animate-pulse text-blue-500" />
                Loading workspace...
            </div>
        </div>
    );

    const activeTicket = tickets.find(t => t.status === "interviewing");
    const calledTicket = tickets.find(t => t.status === "called");
    const queueTickets = tickets.filter(t => t.status === "pending");
    const selectedComp = companies.find(c => c.id === selectedCompany);

    return (
        <div className="min-h-screen bg-[#0A0A0B] text-gray-100 font-sans selection:bg-blue-500/30">
            {/* Topbar (Google UI) */}
            <header className="sticky top-0 z-20 bg-[#0A0A0B]/80 backdrop-blur-xl border-b border-gray-800/60 px-4 md:px-6 py-3.5 flex items-center justify-between transition-all">
                <div className="flex items-center gap-3.5">
                    <div>
                        <h1 className="font-medium text-sm leading-tight tracking-wide text-gray-100">Interviews</h1>
                        {profile && <p className="text-gray-500 text-[11px] font-medium tracking-wide mt-0.5">{profile.full_name}</p>}
                    </div>
                </div>
                <div className="flex items-center gap-1.5 md:gap-3">
                    <a href="/display" target="_blank" className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-400 hover:text-gray-200 hover:bg-[#1E1F22] rounded-full transition-colors hidden sm:flex">
                        <MonitorUp className="w-3.5 h-3.5" /> Display
                    </a>
                    <button onClick={handleSignOut} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-400 hover:text-gray-200 hover:bg-[#1E1F22] rounded-full transition-colors">
                        <LogOut className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Sign Out</span>
                    </button>
                </div>
            </header>

            <main className="max-w-3xl mx-auto p-4 md:px-8 md:py-10 space-y-8 pb-24">
                {/* Conflict Alert Base */}
                {conflict && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-start gap-3.5 shadow-sm transition-all animate-in fade-in slide-in-from-top-2">
                        <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                        <div className="flex-1">
                            <h3 className="font-medium text-sm text-red-200">System Conflict</h3>
                            <p className="text-sm text-red-300/80 mt-1 leading-relaxed">{conflict.msg}</p>
                            <button onClick={() => setConflict(null)} className="text-xs font-bold text-red-400 hover:text-red-300 mt-3 tracking-wide uppercase">Dismiss</button>
                        </div>
                    </div>
                )}

                {/* Company Selector (Admin) */}
                {isAdmin ? (
                    <div className="space-y-2 bg-[#131314] p-5 rounded-3xl border border-gray-800/60">
                        <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest pl-1">Select Workspace</label>
                        <select value={selectedCompany} onChange={e => setSelectedCompany(e.target.value)}
                            className="w-full h-12 px-4 bg-[#1E1F22] border-none rounded-2xl text-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 appearance-none transition-all">
                            <option value="">Choose a company...</option>
                            {companies.map(c => (
                                <option key={c.id} value={c.id}>{c.name} ({c.interview_date === "2026-03-03" ? "Mar 3" : "Mar 4"})</option>
                            ))}
                        </select>
                    </div>
                ) : profile?.company_id && companies.length > 0 && (
                    <div className="px-2 pb-2">
                        <p className="text-[11px] font-bold text-blue-400 uppercase tracking-widest mb-1">Assigned Workspace</p>
                        <h2 className="text-3xl font-medium tracking-tight text-white">{companies[0].name}</h2>
                    </div>
                )}

                {!profile?.company_id && !isAdmin && (
                    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-3xl p-8 text-center text-yellow-500">
                        <h3 className="font-medium mb-1">No Workspace Assigned</h3>
                        <p className="text-sm opacity-80">Please request an administrator to grant you access.</p>
                    </div>
                )}

                {selectedCompany && (
                    <div className="space-y-8 animate-in fade-in duration-700 delay-150">

                        {/* Metrics Layout */}
                        <div className="grid grid-cols-3 gap-3">
                            {[
                                { label: "In Session", value: activeTicket ? 1 : 0 },
                                { label: "At Door", value: calledTicket ? 1 : 0 },
                                { label: "Waiting", value: queueTickets.length },
                            ].map(metric => (
                                <div key={metric.label} className="bg-[#131314] border border-gray-800/60 rounded-[20px] p-5 flex flex-col items-center justify-center transition-colors hover:bg-[#1A1B1E]">
                                    <span className="text-2xl md:text-3xl font-medium text-white">{metric.value}</span>
                                    <span className="text-[10px] md:text-xs font-semibold uppercase tracking-widest text-gray-500 mt-2">{metric.label}</span>
                                </div>
                            ))}
                        </div>

                        {/* Active Operations Area */}
                        <div className="space-y-4">

                            {/* Currently Interviewing Card */}
                            {activeTicket && (
                                <div className="bg-[#1A1B1E] rounded-2xl p-6 relative overflow-hidden group transition-all">
                                    <div className="flex items-center gap-2 mb-4">
                                        <span className="relative flex h-2 w-2">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500/50 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                        </span>
                                        <span className="text-[11px] font-medium text-green-500/80 tracking-wide">In Session</span>
                                    </div>
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
                                        <div>
                                            <h3 className="text-xl font-medium text-gray-100">{activeTicket.registration?.full_name}</h3>
                                            <p className="text-[13px] text-gray-500 mt-1">{activeTicket.registration?.student_number} · {activeTicket.registration?.level}</p>
                                        </div>
                                        <button onClick={() => { if (confirm("Mark interview as completed?")) updateStatus(activeTicket, "completed"); }}
                                            className="flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3 bg-[#25262B] hover:bg-[#2C2D33] text-gray-300 rounded-xl text-sm font-medium transition-all">
                                            <CheckCircle2 className="w-4 h-4" /> Complete
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Called Ticket Card (Walking to room) */}
                            {calledTicket && (
                                <div className="bg-blue-500/5 border border-blue-500/10 rounded-2xl p-6 relative transition-all">
                                    <div className="flex items-center gap-2 mb-4">
                                        <Volume2 className="w-4 h-4 text-blue-400/80 animate-pulse" />
                                        <span className="text-[11px] font-medium text-blue-400/80 tracking-wide">Arriving Next</span>
                                    </div>
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
                                        <div>
                                            <h3 className="text-xl font-medium text-gray-100">{calledTicket.registration?.full_name}</h3>
                                            <p className="text-[13px] text-gray-500 mt-1">{calledTicket.registration?.student_number}</p>
                                        </div>
                                        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                                            <button onClick={() => { if (confirm(`Start interview with ${calledTicket.registration?.full_name}?`)) updateStatus(calledTicket, "interviewing"); }} disabled={!!activeTicket}
                                                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-20 disabled:grayscale text-white rounded-xl text-sm font-medium transition-all">
                                                Begin <span className="hidden sm:inline">Session</span>
                                            </button>
                                            <button onClick={() => { if (confirm(`Mark ${calledTicket.registration?.full_name} as No Show?`)) updateStatus(calledTicket, "skipped"); }}
                                                className="flex items-center justify-center gap-2 px-4 py-3 text-gray-500 hover:text-gray-300 hover:bg-[#25262B] rounded-xl transition-colors">
                                                <UserMinus className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                        </div>

                        {/* Roster / Queue List */}
                        <div className="mt-10">
                            <div className="flex items-center justify-between mb-5 px-1">
                                <h3 className="text-[13px] font-bold text-gray-300 tracking-wide">Queue List</h3>
                                <div className="px-3 py-1 bg-[#1A1A1E] text-gray-400 text-[11px] font-bold tracking-widest uppercase rounded-full">{queueTickets.length} Total</div>
                            </div>

                            <div className="bg-[#131314] border border-gray-800/60 rounded-[28px] overflow-hidden">
                                {queueTickets.length === 0 ? (
                                    <div className="p-10 text-center">
                                        <p className="text-sm text-gray-500 font-medium">No candidates in queue.</p>
                                    </div>
                                ) : (
                                    <div className="divide-y divide-gray-800/50">
                                        {queueTickets.map((ticket, i) => (
                                            <div key={ticket.id} className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:bg-[#1A1B1E] transition-colors">
                                                <div className="flex items-center gap-4 w-full sm:w-auto">
                                                    <span className="w-8 h-8 rounded-full bg-gray-800/50 flex items-center justify-center text-[11px] font-bold text-gray-500 select-none border border-gray-700/50">{i + 1}</span>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-base font-medium text-gray-200 truncate">{ticket.registration?.full_name}</p>
                                                        <p className="text-[13px] text-gray-500 mt-0.5 truncate">{ticket.registration?.student_number} <span className="mx-1.5 opacity-40">|</span> {ticket.registration?.level}</p>
                                                    </div>
                                                </div>

                                                <div className="flex gap-2.5 w-full sm:w-auto pl-12 sm:pl-0">
                                                    {/* Strict Logic Requirement: Only show "Call" if no one is currently called */}
                                                    {!calledTicket && (
                                                        <button onClick={() => { if (confirm(`Call ${ticket.registration?.full_name} to the room?`)) updateStatus(ticket, "called"); }}
                                                            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-5 py-2.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 rounded-xl text-xs font-bold uppercase tracking-widest transition-all">
                                                            Call Next
                                                        </button>
                                                    )}
                                                    <button onClick={() => { if (confirm(`Skip ${ticket.registration?.full_name}?`)) updateStatus(ticket, "skipped"); }}
                                                        className="px-4 py-2.5 text-gray-500 hover:text-gray-300 hover:bg-gray-800/80 rounded-xl text-xs font-bold uppercase tracking-widest transition-all border border-transparent hover:border-gray-700/50">
                                                        Skip
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Skipped Recovery Zone */}
                        {skippedTickets.length > 0 && (
                            <div className="mt-12 opacity-60 hover:opacity-100 transition-opacity duration-300">
                                <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-4 px-1">Skipped Profiles</h3>
                                <div className="bg-[#131314]/50 border border-gray-800/40 rounded-[24px] overflow-hidden">
                                    <div className="divide-y divide-gray-800/30">
                                        {skippedTickets.map(ticket => (
                                            <div key={ticket.id} className="p-4 flex items-center justify-between gap-4 text-sm">
                                                <div className="min-w-0 pl-2">
                                                    <p className="font-medium text-gray-400 truncate">{ticket.registration?.full_name}</p>
                                                </div>
                                                <button
                                                    onClick={() => { if (confirm(`Recall ${ticket.registration?.full_name} back to the queue?`)) recallTicket(ticket); }}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded-lg transition-colors shrink-0"
                                                >
                                                    <Plus className="w-3.5 h-3.5" /> Re-add
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                    </div>
                )}
            </main>
        </div>
    );
}
