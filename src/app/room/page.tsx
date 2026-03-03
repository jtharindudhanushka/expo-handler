"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { LogOut, MonitorUp, AlertTriangle, CheckCircle2, Volume2, UserX, Users } from "lucide-react";

interface Company { id: string; name: string; interview_date: string }
interface Registration { id: string; full_name: string; student_number: string; email: string; level: string }
interface Ticket {
    id: string; status: string; position: number; created_at: string;
    registration_id: string;
    registration?: Registration;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
    pending: { label: "Waiting", color: "bg-gray-100 text-gray-700 border-gray-200" },
    called: { label: "Called", color: "bg-blue-50 text-blue-700 border-blue-200" },
    interviewing: { label: "Interviewing", color: "bg-green-50 text-green-700 border-green-200" },
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
        <div className="min-h-screen bg-white flex items-center justify-center">
            <div className="text-gray-400 font-medium">Loading workspace...</div>
        </div>
    );

    const activeTicket = tickets.find(t => t.status === "interviewing");
    const calledTicket = tickets.find(t => t.status === "called");
    const queueTickets = tickets.filter(t => t.status === "pending");
    const selectedComp = companies.find(c => c.id === selectedCompany);

    return (
        <div className="min-h-screen bg-stone-50 text-stone-900 font-sans selection:bg-stone-200">
            {/* Minimalist Topbar */}
            <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-stone-200 px-4 md:px-8 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-md bg-stone-900 flex items-center justify-center shadow-sm">
                        <Users className="w-4 h-4 text-white" />
                    </div>
                    <div>
                        <h1 className="font-semibold text-sm leading-tight text-stone-900">Interviews</h1>
                        {profile && <p className="text-stone-500 text-xs">{profile.full_name}</p>}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <a href="/display" target="_blank" className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-md transition-colors hidden sm:flex">
                        <MonitorUp className="w-3.5 h-3.5" /> Display
                    </a>
                    <div className="w-px h-4 bg-stone-200 mx-1 hidden sm:block"></div>
                    <button onClick={handleSignOut} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-md transition-colors">
                        <LogOut className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Sign Out</span>
                    </button>
                </div>
            </header>

            <main className="max-w-3xl mx-auto p-4 md:p-8 space-y-8 pb-20">
                {/* Conflict Alert Base */}
                {conflict && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3 text-red-800 shadow-sm transition-all animate-in fade-in slide-in-from-top-2">
                        <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                        <div className="flex-1">
                            <h3 className="font-semibold text-sm">Conflict Detected</h3>
                            <p className="text-sm opacity-90 mt-1">{conflict.msg}</p>
                            <button onClick={() => setConflict(null)} className="text-xs font-medium text-red-600 hover:text-red-800 mt-2 underline underline-offset-2">Dismiss</button>
                        </div>
                    </div>
                )}

                {/* Company Selector (Admin) */}
                {isAdmin ? (
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-stone-500 uppercase tracking-wider">Select Workspace</label>
                        <select value={selectedCompany} onChange={e => setSelectedCompany(e.target.value)}
                            className="w-full h-10 px-3 bg-white border border-stone-200 rounded-md text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-stone-200 shadow-sm transition-all">
                            <option value="">Choose a company...</option>
                            {companies.map(c => (
                                <option key={c.id} value={c.id}>{c.name} ({c.interview_date === "2026-03-03" ? "Mar 3" : "Mar 4"})</option>
                            ))}
                        </select>
                    </div>
                ) : profile?.company_id && companies.length > 0 && (
                    <div className="pb-4 border-b border-stone-200">
                        <p className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-1">Company Board</p>
                        <h2 className="text-2xl font-bold tracking-tight text-stone-900">{companies[0].name}</h2>
                    </div>
                )}

                {!profile?.company_id && !isAdmin && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center text-yellow-800 shadow-sm">
                        <h3 className="font-semibold mb-1">No Company Assigned</h3>
                        <p className="text-sm opacity-80">Please request an administrator to assign you to a workspace.</p>
                    </div>
                )}

                {selectedCompany && (
                    <div className="space-y-8 animate-in fade-in duration-500">

                        {/* Metrics Layout - Notion Style */}
                        <div className="grid grid-cols-3 gap-4">
                            {[
                                { label: "Interviewing", value: activeTicket ? 1 : 0 },
                                { label: "At Door", value: calledTicket ? 1 : 0 },
                                { label: "Waiting", value: queueTickets.length },
                            ].map(metric => (
                                <div key={metric.label} className="bg-white border border-stone-200 rounded-lg p-4 shadow-sm flex flex-col items-center justify-center">
                                    <span className="text-2xl font-semibold text-stone-900">{metric.value}</span>
                                    <span className="text-xs font-medium text-stone-500 mt-1">{metric.label}</span>
                                </div>
                            ))}
                        </div>

                        {/* Active Operations Area */}
                        <div className="space-y-4">

                            {/* Currently Interviewing Card */}
                            {activeTicket && (
                                <div className="bg-white border text-stone-900 border-green-200 rounded-xl p-5 shadow-sm relative overflow-hidden group transition-all">
                                    <div className="absolute top-0 left-0 w-1 h-full bg-green-500"></div>
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className="relative flex h-2 w-2">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                        </span>
                                        <span className="text-xs font-bold text-green-700 uppercase tracking-wider">In Progress</span>
                                    </div>
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                        <div>
                                            <h3 className="text-xl font-bold">{activeTicket.registration?.full_name}</h3>
                                            <p className="text-sm text-stone-500 font-medium mt-0.5">{activeTicket.registration?.student_number} · {activeTicket.registration?.level}</p>
                                        </div>
                                        <button onClick={() => { if (confirm("Mark interview as completed?")) updateStatus(activeTicket, "completed"); }}
                                            className="flex items-center justify-center gap-2 w-full sm:w-auto px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-md text-sm font-medium transition-colors shadow-sm">
                                            <CheckCircle2 className="w-4 h-4" /> Complete
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Called Ticket Card (Walking to room) */}
                            {calledTicket && (
                                <div className="bg-white border border-blue-200 rounded-xl p-5 shadow-sm relative overflow-hidden transition-all">
                                    <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
                                    <div className="flex items-center gap-2 mb-3">
                                        <Volume2 className="w-3.5 h-3.5 text-blue-600 animate-pulse" />
                                        <span className="text-xs font-bold text-blue-700 uppercase tracking-wider">Arriving</span>
                                    </div>
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                        <div>
                                            <h3 className="text-lg font-bold text-stone-900">{calledTicket.registration?.full_name}</h3>
                                            <p className="text-sm text-stone-500 font-medium mt-0.5">{calledTicket.registration?.student_number}</p>
                                        </div>
                                        <div className="flex gap-2 w-full sm:w-auto">
                                            <button onClick={() => { if (confirm(`Start interview with ${calledTicket.registration?.full_name}?`)) updateStatus(calledTicket, "interviewing"); }} disabled={!!activeTicket}
                                                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed rounded-md text-sm font-medium transition-colors">
                                                Start
                                            </button>
                                            <button onClick={() => { if (confirm(`Mark ${calledTicket.registration?.full_name} as No Show?`)) updateStatus(calledTicket, "skipped"); }}
                                                className="flex items-center justify-center gap-1.5 px-3 py-2 text-stone-500 hover:text-stone-700 hover:bg-stone-100 rounded-md text-sm font-medium transition-colors">
                                                <UserX className="w-4 h-4" />
                                            </button>
                                        </div>
                                        {activeTicket && (
                                            <p className="text-[10px] text-stone-400 absolute bottom-2 right-4 hidden sm:block">Finish current interview to start</p>
                                        )}
                                    </div>
                                </div>
                            )}

                        </div>

                        {/* Roster / Queue List */}
                        <div className="mt-8">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-sm font-bold text-stone-900 border-b-2 border-stone-900 pb-1 inline-block">Up Next</h3>
                                <div className="px-2 py-0.5 bg-stone-100 border border-stone-200 text-stone-600 text-xs font-semibold rounded-full">{queueTickets.length}</div>
                            </div>

                            <div className="bg-white border border-stone-200 rounded-lg shadow-sm overflow-hidden">
                                {queueTickets.length === 0 ? (
                                    <div className="p-8 text-center bg-stone-50">
                                        <p className="text-sm text-stone-500 font-medium">No candidates in queue.</p>
                                    </div>
                                ) : (
                                    <div className="divide-y divide-stone-100">
                                        {queueTickets.map((ticket, i) => (
                                            <div key={ticket.id} className="p-3 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:bg-stone-50/80 transition-colors">
                                                <div className="flex items-center gap-3 w-full sm:w-auto">
                                                    <span className="w-6 text-center text-xs font-bold text-stone-400 select-none">{i + 1}</span>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-semibold text-stone-900 truncate">{ticket.registration?.full_name}</p>
                                                        <p className="text-xs text-stone-500 truncate">{ticket.registration?.student_number} · {ticket.registration?.level}</p>
                                                    </div>
                                                </div>

                                                <div className="flex gap-2 w-full sm:w-auto pl-9 sm:pl-0">
                                                    {/* Strict Logic Requirement: Only show "Call" if no one is currently called */}
                                                    {!calledTicket && (
                                                        <button onClick={() => { if (confirm(`Call ${ticket.registration?.full_name} to the room?`)) updateStatus(ticket, "called"); }}
                                                            className="flex-1 sm:flex-none px-3 py-1.5 bg-stone-900 hover:bg-stone-800 text-white rounded-md text-xs font-medium transition-all shadow-sm">
                                                            Call
                                                        </button>
                                                    )}
                                                    <button onClick={() => { if (confirm(`Skip ${ticket.registration?.full_name}?`)) updateStatus(ticket, "skipped"); }}
                                                        className="px-3 py-1.5 text-stone-500 hover:text-stone-800 hover:bg-stone-200 rounded-md text-xs font-medium transition-all">
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
                            <div className="mt-8 opacity-70 hover:opacity-100 transition-opacity">
                                <h3 className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-3">Skipped / No-Shows</h3>
                                <div className="bg-stone-100 border border-stone-200 rounded-lg overflow-hidden">
                                    <div className="divide-y divide-stone-200/50">
                                        {skippedTickets.map(ticket => (
                                            <div key={ticket.id} className="p-3 flex items-center justify-between gap-3 text-sm">
                                                <div className="min-w-0">
                                                    <p className="font-medium text-stone-600 truncate">{ticket.registration?.full_name}</p>
                                                </div>
                                                <button
                                                    onClick={() => { if (confirm(`Recall ${ticket.registration?.full_name} back to the queue?`)) recallTicket(ticket); }}
                                                    className="px-2 py-1 text-xs font-medium text-stone-500 hover:text-stone-900 hover:bg-stone-200 rounded transition-colors shrink-0"
                                                >
                                                    Recall
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
