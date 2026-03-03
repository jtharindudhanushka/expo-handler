"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { LogOut, MonitorUp, AlertCircle, CheckCircle2, Volume2, UserMinus, Plus, Sparkles, Building2, Search } from "lucide-react";

interface Company { id: string; name: string; interview_date: string }
interface Registration { id: string; full_name: string; student_number: string; email: string; level: string; is_present: boolean; }
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
    const [showPresentOnly, setShowPresentOnly] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
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
            .select("id, status, position, created_at, registration_id, registration:registrations(id, full_name, student_number, email, level, is_present)")
            .eq("company_id", selectedCompany)
            .in("status", ["pending", "called", "interviewing"])
            .order("position", { ascending: true });
        setTickets((data || []) as unknown as Ticket[]);

        const { data: skipped } = await supabase
            .from("queue_tickets")
            .select("id, status, position, created_at, registration_id, registration:registrations(id, full_name, student_number, email, level, is_present)")
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

    const activeTickets = tickets.filter(t => t.status === "interviewing");
    const calledTickets = tickets.filter(t => t.status === "called");
    const queueTickets = tickets.filter(t => {
        if (t.status !== "pending") return false;
        if (showPresentOnly && !t.registration?.is_present) return false;
        if (searchQuery && t.registration) {
            const lowerSearch = searchQuery.toLowerCase();
            return t.registration.full_name?.toLowerCase().includes(lowerSearch) ||
                t.registration.student_number?.toLowerCase().includes(lowerSearch);
        }
        return true;
    });
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
                                { label: "In Session", value: activeTickets.length },
                                { label: "At Door", value: calledTickets.length },
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

                            {/* Currently Interviewing Cards - Flattened */}
                            {activeTickets.map(activeTicket => (
                                <div key={activeTicket.id} className="py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-6 transition-all border-b border-gray-800/40 pb-6">
                                    <div className="flex flex-col gap-1.5">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="relative flex h-2 w-2">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500/50 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                            </span>
                                            <span className="text-[11px] font-bold text-gray-500 tracking-widest uppercase">Currently In Session</span>
                                        </div>
                                        <h3 className="text-2xl font-medium text-gray-100 tracking-tight">{activeTicket.registration?.full_name}</h3>
                                        <p className="text-[13px] text-gray-500 font-medium">{activeTicket.registration?.student_number} <span className="mx-1.5 opacity-40">|</span> {activeTicket.registration?.level}</p>
                                    </div>
                                    <button onClick={() => { if (confirm("Mark interview as completed?")) updateStatus(activeTicket, "completed"); }}
                                        className="flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3.5 sm:py-3 bg-[#1E1F22] hover:bg-[#25262B] border border-gray-800 text-gray-200 rounded-xl text-sm font-medium transition-all shadow-sm">
                                        <CheckCircle2 className="w-4 h-4" /> Complete
                                    </button>
                                </div>
                            ))}

                            {/* Called Ticket Cards (Walking to room) - Flattened */}
                            {calledTickets.map(calledTicket => (
                                <div key={calledTicket.id} className="py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-6 transition-all border-b border-gray-800/40 pb-6">
                                    <div className="flex flex-col gap-1.5">
                                        <div className="flex items-center gap-2 mb-1">
                                            <Volume2 className="w-4 h-4 text-blue-500 animate-pulse" />
                                            <span className="text-[11px] font-bold text-blue-500 tracking-widest uppercase">Arriving Next</span>
                                        </div>
                                        <h3 className="text-2xl font-medium text-gray-100 tracking-tight">{calledTicket.registration?.full_name}</h3>
                                        <p className="text-[13px] text-gray-500 font-medium">{calledTicket.registration?.student_number}</p>
                                    </div>
                                    <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto mt-2 sm:mt-0">
                                        <button onClick={() => { if (confirm(`Start interview with ${calledTicket.registration?.full_name}?`)) updateStatus(calledTicket, "interviewing"); }}
                                            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3.5 sm:py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium transition-all shadow-sm">
                                            Begin <span className="hidden sm:inline">Session</span>
                                        </button>
                                        <button onClick={() => { if (confirm(`Mark ${calledTicket.registration?.full_name} as No Show?`)) updateStatus(calledTicket, "skipped"); }}
                                            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3.5 sm:py-3 text-gray-300 hover:text-white bg-[#1E1F22] hover:bg-[#25262B] border border-gray-800 rounded-xl text-sm font-medium transition-all shadow-sm">
                                            <UserMinus className="w-4 h-4" /> Skip Candidate
                                        </button>
                                    </div>
                                </div>
                            ))}

                        </div>

                        {/* Roster / Queue List */}
                        <div className="mt-10">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-5 gap-3 px-1">
                                <div className="flex items-center gap-3">
                                    <h3 className="text-[13px] font-bold text-gray-300 tracking-wide">Queue List</h3>
                                    <div className="px-3 py-1 bg-[#1A1A1E] text-gray-400 text-[11px] font-bold tracking-widest uppercase rounded-full">{queueTickets.length} Total</div>
                                </div>
                                <label className="flex items-center gap-2 cursor-pointer touch-manipulation">
                                    <div className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${showPresentOnly ? 'bg-green-500' : 'bg-gray-700'}`}>
                                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${showPresentOnly ? 'translate-x-6' : 'translate-x-1'}`} />
                                    </div>
                                    <input type="checkbox" className="sr-only" checked={showPresentOnly} onChange={() => setShowPresentOnly(!showPresentOnly)} />
                                    <span className="text-xs font-bold uppercase tracking-widest text-gray-400 select-none">Show Present Only</span>
                                </label>
                            </div>

                            {/* Search Bar */}
                            <div className="relative mb-5 group">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 transition-colors group-focus-within:text-blue-500" />
                                <input
                                    type="text"
                                    placeholder="Search by name or student ID..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full h-12 pl-11 pr-4 bg-[#131314] border border-gray-800/60 rounded-2xl text-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all placeholder:text-gray-600"
                                />
                            </div>

                            <div className="bg-[#131314] border border-gray-800/60 rounded-[28px] overflow-hidden">
                                {queueTickets.length === 0 ? (
                                    <div className="p-10 text-center">
                                        <p className="text-sm text-gray-500 font-medium">No candidates found in queue.</p>
                                    </div>
                                ) : (
                                    <div className="divide-y divide-gray-800/50">
                                        {queueTickets.map((ticket, i) => (
                                            <div key={ticket.id} className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:bg-[#1A1B1E] transition-colors">
                                                <div className="flex items-center gap-4 w-full sm:w-auto">
                                                    <span className="w-8 h-8 rounded-full bg-gray-800/50 flex items-center justify-center text-[11px] font-bold text-gray-500 select-none border border-gray-700/50">{i + 1}</span>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <p className="text-base font-medium text-gray-200 truncate">{ticket.registration?.full_name}</p>
                                                            {ticket.registration?.is_present && (
                                                                <span className="shrink-0 px-1.5 py-0.5 rounded mr-2 bg-green-500/20 text-green-400 text-[9px] font-bold uppercase tracking-widest border border-green-500/20">Present</span>
                                                            )}
                                                        </div>
                                                        <p className="text-[13px] text-gray-500 mt-0.5 truncate">{ticket.registration?.student_number} <span className="mx-1.5 opacity-40">|</span> {ticket.registration?.level}</p>
                                                    </div>
                                                </div>

                                                <div className="flex gap-2.5 w-full sm:w-auto pl-12 sm:pl-0">
                                                    {/* Concurrency allowed: Call Next is always visible */}
                                                    <button onClick={() => { if (confirm(`Call ${ticket.registration?.full_name} to the room?`)) updateStatus(ticket, "called"); }}
                                                        className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-6 py-2.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 rounded-xl text-xs font-bold uppercase tracking-widest transition-all">
                                                        Call Next
                                                    </button>
                                                    <button onClick={() => { if (confirm(`Skip ${ticket.registration?.full_name}?`)) updateStatus(ticket, "skipped"); }}
                                                        className="flex-1 sm:flex-none px-6 py-2.5 text-gray-300 hover:text-white bg-[#1E1F22] hover:bg-[#25262B] border border-gray-800 rounded-xl text-xs font-bold uppercase tracking-widest transition-all">
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
