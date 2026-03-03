"use client";
import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { Database, LogOut, Search, Clock, PlayCircle, CheckCircle2 } from "lucide-react";

interface Ticket {
    id: string;
    status: string;
    position: number;
    created_at: string;
    registration_id: string;
    company_id: string;
    registration?: { full_name: string; student_number: string; level: string };
    company?: { name: string };
}

const STATUS_STYLE: Record<string, { label: string; cls: string; icon: any }> = {
    pending: { label: "Waiting", cls: "bg-gray-800/50 text-gray-400 border-gray-700/50", icon: Clock },
    called: { label: "Called", cls: "bg-blue-500/10 text-blue-400 border-blue-500/20", icon: PlayCircle },
    interviewing: { label: "In Session", cls: "bg-green-500/10 text-green-400 border-green-500/20", icon: CheckCircle2 },
};

export default function WaitingRoomBoard() {
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [loading, setLoading] = useState(true);
    const [time, setTime] = useState(new Date());
    const [filter, setFilter] = useState<"all" | "pending" | "called" | "interviewing">("all");
    const [search, setSearch] = useState("");
    const [authed, setAuthed] = useState(false);
    const supabase = createClient();
    const router = useRouter();
    const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

    // Auth gate
    useEffect(() => {
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (!user) { router.push("/login"); return; }
            setAuthed(true);
        });
    }, [router, supabase]);

    const fetchTickets = async () => {
        const { data } = await supabase
            .from("queue_tickets")
            .select("id, status, position, created_at, registration_id, company_id, registration:registrations(full_name, student_number, level), company:companies(name)")
            .in("status", ["pending", "called", "interviewing"])
            .order("company_id")
            .order("position", { ascending: true });
        setTickets((data || []) as unknown as Ticket[]);
        setLoading(false);
    };

    useEffect(() => {
        if (!authed) return;
        fetchTickets();
        const timer = setInterval(() => setTime(new Date()), 1000);

        const channelName = `board-${Date.now()}`;
        const channel = supabase
            .channel(channelName)
            .on("postgres_changes", {
                event: "*",
                schema: "public",
                table: "queue_tickets",
            }, () => { fetchTickets(); })
            .subscribe();

        channelRef.current = channel;
        return () => {
            clearInterval(timer);
            channel.unsubscribe();
        };
    }, [authed, supabase]);

    const filtered = tickets.filter(t => {
        const matchStatus = filter === "all" || t.status === filter;
        const matchSearch = !search || t.registration?.full_name.toLowerCase().includes(search.toLowerCase()) || t.registration?.student_number?.toLowerCase().includes(search.toLowerCase());
        return matchStatus && matchSearch;
    });

    const counts = {
        pending: tickets.filter(t => t.status === "pending").length,
        called: tickets.filter(t => t.status === "called").length,
        interviewing: tickets.filter(t => t.status === "interviewing").length,
    };

    if (!authed) return (
        <div className="min-h-screen bg-[#0A0A0B] flex items-center justify-center">
            <div className="text-gray-500 font-medium flex items-center gap-3">
                <Database className="w-5 h-5 animate-pulse text-blue-500" />
                Authenticating...
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-[#0A0A0B] flex flex-col font-sans text-gray-100 selection:bg-blue-500/30">
            {/* Header */}
            <header className="bg-[#131314] border-b border-gray-800/60 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                        <Database className="w-4 h-4 text-blue-400" />
                    </div>
                    <div>
                        <h1 className="font-medium text-lg leading-tight tracking-tight text-white">Master Directory</h1>
                        <p className="text-gray-500 text-[11px] font-bold uppercase tracking-widest mt-0.5 hidden sm:block">Internal Monitor</p>
                    </div>
                </div>
                <div className="flex items-center gap-6">
                    <span className="text-gray-400 font-mono text-sm font-medium tabular-nums hidden sm:block">
                        {time.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </span>
                    <button onClick={() => { supabase.auth.signOut(); router.push("/login"); }}
                        className="flex items-center gap-2 text-sm font-medium text-gray-400 hover:text-gray-200 hover:bg-[#1E1F22] py-2 px-4 rounded-full transition-colors border border-transparent hover:border-gray-800">
                        <LogOut className="w-4 h-4" /> <span className="hidden sm:inline">Sign Out</span>
                    </button>
                </div>
            </header>

            {/* Toolbar (Filters & Search) */}
            <div className="bg-[#0A0A0B] border-b border-gray-800/40 px-6 py-4 flex flex-col sm:flex-row items-center gap-5 z-0">
                <div className="flex flex-wrap gap-2.5 w-full sm:w-auto">
                    {(["all", "pending", "called", "interviewing"] as const).map(s => (
                        <button
                            key={s}
                            onClick={() => setFilter(s)}
                            className={`flex flex-1 sm:flex-none items-center justify-center gap-2 px-5 py-2 rounded-full text-xs font-bold transition-all border ${filter === s ? "bg-white text-gray-900 border-white shadow-sm" : "bg-[#131314] text-gray-400 border-gray-800 hover:bg-[#1E1F22] hover:text-gray-200"}`}
                        >
                            {s === "all" ? `All (${tickets.length})`
                                : s === "pending" ? <><Clock className="w-3.5 h-3.5" /> Waiting ({counts.pending})</>
                                    : s === "called" ? <><PlayCircle className="w-3.5 h-3.5" /> Called ({counts.called})</>
                                        : <><CheckCircle2 className="w-3.5 h-3.5" /> Session ({counts.interviewing})</>}
                        </button>
                    ))}
                </div>
                <div className="w-full sm:w-auto sm:ml-auto flex items-center gap-2.5 bg-[#131314] border border-gray-800 rounded-full px-4 py-2 text-gray-400 focus-within:border-blue-500/50 focus-within:bg-[#1A1A1E] transition-all">
                    <Search className="w-4 h-4" />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search name or ID..."
                        className="w-full sm:w-56 bg-transparent text-sm text-gray-100 placeholder-gray-600 focus:outline-none"
                    />
                </div>
            </div>

            {/* Table Area */}
            <div className="flex-1 overflow-auto p-6">
                <div className="max-w-7xl mx-auto bg-[#131314] border border-gray-800/60 rounded-[28px] overflow-hidden">
                    {loading ? (
                        <div className="p-16 text-center text-gray-500 animate-pulse font-medium">Loading network records...</div>
                    ) : filtered.length === 0 ? (
                        <div className="p-20 text-center text-gray-600 flex flex-col items-center">
                            <Search className="w-8 h-8 text-gray-700 mb-4" />
                            <p className="font-medium text-sm">No profiles match criteria.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-[#0A0A0B]/50 border-b border-gray-800/60 text-gray-500 text-[11px] uppercase tracking-widest font-bold">
                                    <tr>
                                        <th className="px-6 py-5 w-16 text-center">#</th>
                                        <th className="px-6 py-5">Profile</th>
                                        <th className="px-6 py-5 hidden sm:table-cell">Identity</th>
                                        <th className="px-6 py-5">Routing</th>
                                        <th className="px-6 py-5">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-800/40">
                                    {filtered.map((ticket, i) => {
                                        const StatusIcon = STATUS_STYLE[ticket.status]?.icon || Clock;
                                        return (
                                            <tr key={ticket.id} className="hover:bg-[#1A1B1E] transition-colors">
                                                <td className="px-6 py-5 text-center text-gray-600 font-bold tabular-nums text-[11px]">{i + 1}</td>
                                                <td className="px-6 py-5">
                                                    <p className="font-medium text-gray-200">{ticket.registration?.full_name}</p>
                                                    <p className="text-gray-500 text-xs mt-1 sm:hidden">{ticket.registration?.student_number}</p>
                                                </td>
                                                <td className="px-6 py-5 hidden sm:table-cell">
                                                    <p className="text-gray-400 font-medium">{ticket.registration?.student_number}</p>
                                                    <p className="text-gray-600 text-[11px] font-bold uppercase tracking-widest mt-1">{ticket.registration?.level}</p>
                                                </td>
                                                <td className="px-6 py-5">
                                                    <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-widest bg-[#1E1F22] text-gray-400 border border-gray-800">
                                                        {ticket.company?.name || "Unassigned"}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-5">
                                                    <span className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-widest border ${STATUS_STYLE[ticket.status]?.cls}`}>
                                                        <StatusIcon className="w-3.5 h-3.5" />
                                                        {STATUS_STYLE[ticket.status]?.label}
                                                    </span>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* Footer */}
            <footer className="bg-[#0A0A0B] px-6 py-4 text-center text-gray-600 text-xs font-medium shrink-0 border-t border-gray-900">
                <span className="flex items-center justify-center gap-2.5">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-60"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600"></span>
                    </span>
                    {tickets.length} total active records
                </span>
            </footer>
        </div>
    );
}
