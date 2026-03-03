"use client";
import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { ClipboardList, LogOut, Search, Clock, PlayCircle, CheckCircle2 } from "lucide-react";

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
    pending: { label: "Waiting", cls: "bg-stone-100 text-stone-600 border-stone-200", icon: Clock },
    called: { label: "Called", cls: "bg-blue-50 text-blue-700 border-blue-200", icon: PlayCircle },
    interviewing: { label: "In Session", cls: "bg-green-50 text-green-700 border-green-200", icon: CheckCircle2 },
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
        <div className="min-h-screen bg-stone-50 flex items-center justify-center">
            <div className="text-stone-400 font-medium">Authenticating...</div>
        </div>
    );

    return (
        <div className="min-h-screen bg-stone-50 flex flex-col font-sans text-stone-900 selection:bg-stone-200">
            {/* Header */}
            <header className="bg-white border-b border-stone-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-stone-900 flex items-center justify-center">
                        <ClipboardList className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h1 className="font-bold text-lg leading-tight tracking-tight">Master Directory</h1>
                        <p className="text-stone-500 text-xs font-medium uppercase tracking-wider hidden sm:block">Internal Queue Monitor</p>
                    </div>
                </div>
                <div className="flex items-center gap-6">
                    <span className="text-stone-600 font-mono text-sm font-semibold tabular-nums hidden sm:block">
                        {time.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </span>
                    <button onClick={() => { supabase.auth.signOut(); router.push("/login"); }}
                        className="flex items-center gap-2 text-sm font-medium text-stone-500 hover:text-stone-900 transition-colors">
                        <LogOut className="w-4 h-4" /> <span className="hidden sm:inline">Sign Out</span>
                    </button>
                </div>
            </header>

            {/* Toolbar */}
            <div className="bg-white border-b border-stone-200 px-6 py-3 flex flex-col sm:flex-row items-center gap-4 shadow-sm z-0">
                <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                    {(["all", "pending", "called", "interviewing"] as const).map(s => (
                        <button
                            key={s}
                            onClick={() => setFilter(s)}
                            className={`flex flex-1 sm:flex-none items-center justify-center gap-2 px-4 py-2 rounded-md text-xs font-semibold transition-all border ${filter === s ? "bg-stone-900 text-white border-stone-900 shadow-sm" : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50 hover:text-stone-900"}`}
                        >
                            {s === "all" ? `All (${tickets.length})`
                                : s === "pending" ? <><Clock className="w-3.5 h-3.5" /> Waiting ({counts.pending})</>
                                    : s === "called" ? <><PlayCircle className="w-3.5 h-3.5" /> Called ({counts.called})</>
                                        : <><CheckCircle2 className="w-3.5 h-3.5" /> Session ({counts.interviewing})</>}
                        </button>
                    ))}
                </div>
                <div className="w-full sm:w-auto sm:ml-auto flex items-center gap-2 bg-stone-100 border border-stone-200 rounded-md px-3 py-2 text-stone-500 focus-within:bg-white focus-within:border-stone-400 focus-within:ring-2 focus-within:ring-stone-100 transition-all">
                    <Search className="w-4 h-4" />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search name or ID..."
                        className="w-full sm:w-48 bg-transparent text-sm text-stone-900 placeholder-stone-400 focus:outline-none"
                    />
                </div>
            </div>

            {/* Table Area */}
            <div className="flex-1 overflow-auto p-6">
                <div className="max-w-7xl mx-auto bg-white border border-stone-200 rounded-xl shadow-sm overflow-hidden">
                    {loading ? (
                        <div className="p-12 text-center text-stone-400 animate-pulse font-medium">Loading queue records...</div>
                    ) : filtered.length === 0 ? (
                        <div className="p-12 pb-16 text-center text-stone-500 flex flex-col items-center">
                            <Search className="w-8 h-8 text-stone-300 mb-3" />
                            <p className="font-medium">No candidates match your current filter.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 text-xs uppercase tracking-wider font-semibold">
                                    <tr>
                                        <th className="px-6 py-4 w-12 text-center">#</th>
                                        <th className="px-6 py-4">Candidate</th>
                                        <th className="px-6 py-4 hidden sm:table-cell">Details</th>
                                        <th className="px-6 py-4">Destination</th>
                                        <th className="px-6 py-4">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-stone-100">
                                    {filtered.map((ticket, i) => {
                                        const StatusIcon = STATUS_STYLE[ticket.status]?.icon || Clock;
                                        return (
                                            <tr key={ticket.id} className="hover:bg-stone-50/80 transition-colors">
                                                <td className="px-6 py-4 text-center text-stone-400 font-medium tabular-nums">{i + 1}</td>
                                                <td className="px-6 py-4">
                                                    <p className="font-bold text-stone-900">{ticket.registration?.full_name}</p>
                                                    <p className="text-stone-500 text-xs mt-0.5 sm:hidden">{ticket.registration?.student_number}</p>
                                                </td>
                                                <td className="px-6 py-4 hidden sm:table-cell">
                                                    <p className="text-stone-700 font-medium">{ticket.registration?.student_number}</p>
                                                    <p className="text-stone-400 text-xs mt-0.5">{ticket.registration?.level}</p>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-stone-100 text-stone-700 border border-stone-200">
                                                        {ticket.company?.name || "Unknown"}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${STATUS_STYLE[ticket.status]?.cls}`}>
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

            <footer className="bg-stone-900 px-6 py-3 text-center text-stone-400 text-xs font-medium border-t border-stone-800 shrink-0">
                <span className="flex items-center justify-center gap-2">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                    </span>
                    {tickets.length} total active records · Real-time synchronization
                </span>
            </footer>
        </div>
    );
}
