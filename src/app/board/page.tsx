"use client";
import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";

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

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
    pending: { label: "Waiting", cls: "bg-amber-500/20 text-amber-300 border-amber-500/40" },
    called: { label: "Called", cls: "bg-blue-500/20 text-blue-300 border-blue-500/40" },
    interviewing: { label: "In Interview", cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" },
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
    }, []);

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

        // Real-time subscription — use unique channel name to avoid stale subscriptions
        const channelName = `board-${Date.now()}`;
        const channel = supabase
            .channel(channelName)
            .on("postgres_changes", {
                event: "*",
                schema: "public",
                table: "queue_tickets",
            }, () => { fetchTickets(); })
            .subscribe((status) => {
                console.log("Board realtime:", status);
            });

        channelRef.current = channel;
        return () => {
            clearInterval(timer);
            channel.unsubscribe();
        };
    }, [authed]);

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
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
            <div className="text-slate-400 animate-pulse">Authenticating...</div>
        </div>
    );

    return (
        <div className="min-h-screen bg-slate-950 flex flex-col font-sans">
            {/* Header */}
            <header className="bg-slate-900 border-b border-slate-700/50 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
                <div className="flex items-center gap-2.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.7)]" />
                    <span className="text-white font-black text-base">Waiting Room Monitor</span>
                    <span className="hidden sm:inline text-slate-500 text-sm">· Career Fair 2026</span>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-slate-400 font-mono text-sm tabular-nums">
                        {time.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </span>
                    <button onClick={() => { supabase.auth.signOut(); router.push("/login"); }}
                        className="text-xs text-slate-500 hover:text-slate-300 transition-colors">Sign Out</button>
                </div>
            </header>

            {/* Stats bar */}
            <div className="bg-slate-900/50 border-b border-slate-800 px-4 py-2 flex items-center gap-3 overflow-x-auto">
                {(["all", "pending", "called", "interviewing"] as const).map(s => (
                    <button
                        key={s}
                        onClick={() => setFilter(s)}
                        className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${filter === s ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-400 hover:bg-slate-700"}`}
                    >
                        {s === "all" ? `All (${tickets.length})` : s === "pending" ? `⏳ Waiting (${counts.pending})` : s === "called" ? `📣 Called (${counts.called})` : `🟢 In Interview (${counts.interviewing})`}
                    </button>
                ))}
                <div className="ml-auto flex-shrink-0">
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search name / ID..."
                        className="w-40 sm:w-52 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto">
                {loading ? (
                    <div className="text-slate-600 text-center py-20 animate-pulse">Loading queue data...</div>
                ) : filtered.length === 0 ? (
                    <div className="text-slate-600 text-center py-20 text-sm">No entries match your filter.</div>
                ) : (
                    <table className="w-full text-sm min-w-[480px]">
                        <thead className="sticky top-0 bg-slate-900 border-b border-slate-800">
                            <tr>
                                <th className="text-left px-4 py-3 text-slate-400 font-semibold text-xs uppercase tracking-wide w-8">#</th>
                                <th className="text-left px-4 py-3 text-slate-400 font-semibold text-xs uppercase tracking-wide">Candidate</th>
                                <th className="text-left px-4 py-3 text-slate-400 font-semibold text-xs uppercase tracking-wide hidden sm:table-cell">Level</th>
                                <th className="text-left px-4 py-3 text-slate-400 font-semibold text-xs uppercase tracking-wide">Company</th>
                                <th className="text-left px-4 py-3 text-slate-400 font-semibold text-xs uppercase tracking-wide">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((ticket, i) => (
                                <tr key={ticket.id} className={`border-b border-slate-800/60 transition-colors ${ticket.status === "interviewing" ? "bg-emerald-500/5" : ticket.status === "called" ? "bg-blue-500/5" : "hover:bg-slate-800/40"}`}>
                                    <td className="px-4 py-3 text-slate-500 text-xs tabular-nums">{i + 1}</td>
                                    <td className="px-4 py-3">
                                        <p className="text-white font-semibold leading-tight">{ticket.registration?.full_name}</p>
                                        <p className="text-slate-500 text-xs mt-0.5">{ticket.registration?.student_number}</p>
                                    </td>
                                    <td className="px-4 py-3 text-slate-400 text-xs hidden sm:table-cell">{ticket.registration?.level}</td>
                                    <td className="px-4 py-3">
                                        <span className="text-slate-300 font-medium text-xs">{ticket.company?.name}</span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-bold border ${STATUS_STYLE[ticket.status]?.cls}`}>
                                            {ticket.status === "called" && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />}
                                            {ticket.status === "interviewing" && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                                            {STATUS_STYLE[ticket.status]?.label}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <footer className="bg-slate-900/50 border-t border-slate-800 px-4 py-2 text-center text-slate-600 text-xs">
                {tickets.length} active · Live updating · {new Date().toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}
            </footer>
        </div>
    );
}
