"use client";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase";

interface QueueTicket {
    id: string;
    status: string;
    created_at: string;
    registration?: { full_name: string; student_number: string };
    company?: { name: string; room_number: string; interview_date: string };
}

const STATUS_COLORS: Record<string, string> = {
    pending: "bg-amber-500/20 text-amber-300",
    called: "bg-blue-500/20 text-blue-300",
    interviewing: "bg-green-500/20 text-green-300",
    completed: "bg-slate-500/20 text-slate-300",
    skipped: "bg-red-500/20 text-red-300",
};

export default function QueueMonitorPage() {
    const [tickets, setTickets] = useState<QueueTicket[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("active");
    const supabase = createClient();

    const fetchTickets = useCallback(async () => {
        let query = supabase
            .from("queue_tickets")
            .select("*, registration:registrations(full_name, student_number), company:companies(name, room_number, interview_date)")
            .order("created_at", { ascending: true });

        if (filter === "active") {
            query = query.in("status", ["pending", "called", "interviewing"]);
        } else if (filter !== "all") {
            query = query.eq("status", filter);
        }

        const { data } = await query;
        setTickets(data || []);
        setLoading(false);
    }, [filter]);

    useEffect(() => { fetchTickets(); }, [fetchTickets]);

    const handleStatusChange = async (id: string, status: string) => {
        await supabase.from("queue_tickets").update({ status }).eq("id", id);
        await fetchTickets();
    };

    const counts = tickets.reduce((acc, t) => {
        acc[t.status] = (acc[t.status] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-black text-white">Queue Monitor</h1>
                <p className="text-slate-400 mt-1">Real-time interview queue across all rooms</p>
            </div>

            {/* Status summary */}
            <div className="flex flex-wrap gap-3">
                {["pending", "called", "interviewing", "completed", "skipped"].map(s => (
                    <div key={s} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${STATUS_COLORS[s]}`}>
                        {s.toUpperCase()}: {counts[s] || 0}
                    </div>
                ))}
            </div>

            {/* Filter */}
            <div className="flex gap-2 flex-wrap">
                {["active", "all", "pending", "called", "interviewing", "completed", "skipped"].map(f => (
                    <button key={f} onClick={() => setFilter(f)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${filter === f ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"}`}>
                        {f}
                    </button>
                ))}
                <button onClick={fetchTickets} className="ml-auto px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-700 text-slate-300 hover:bg-slate-600 transition-all">↻ Refresh</button>
            </div>

            {loading ? (
                <div className="text-slate-400 text-center py-20">Loading queue...</div>
            ) : (
                <div className="bg-slate-900 border border-slate-700/50 rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-700/50">
                                    <th className="text-left px-4 py-3 text-slate-400 font-semibold">#</th>
                                    <th className="text-left px-4 py-3 text-slate-400 font-semibold">Candidate</th>
                                    <th className="text-left px-4 py-3 text-slate-400 font-semibold">Company / Room</th>
                                    <th className="text-left px-4 py-3 text-slate-400 font-semibold">Date</th>
                                    <th className="text-left px-4 py-3 text-slate-400 font-semibold">Status</th>
                                    <th className="text-right px-4 py-3 text-slate-400 font-semibold">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tickets.map((t, i) => (
                                    <tr key={t.id} className="border-b border-slate-700/30 hover:bg-slate-800/50 transition-colors">
                                        <td className="px-4 py-3 text-slate-500 text-xs">{i + 1}</td>
                                        <td className="px-4 py-3">
                                            <p className="text-white font-semibold">{t.registration?.full_name || "—"}</p>
                                            <p className="text-slate-500 text-xs">{t.registration?.student_number}</p>
                                        </td>
                                        <td className="px-4 py-3">
                                            <p className="text-slate-300">{t.company?.name || "—"}</p>
                                            <p className="text-slate-500 text-xs">{t.company?.room_number}</p>
                                        </td>
                                        <td className="px-4 py-3 text-slate-400 text-xs">
                                            {t.company?.interview_date ? new Date(t.company.interview_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${STATUS_COLORS[t.status] || ""}`}>{t.status.toUpperCase()}</span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <select
                                                value={t.status}
                                                onChange={e => handleStatusChange(t.id, e.target.value)}
                                                className="text-xs bg-slate-700 border border-slate-600 text-white rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                            >
                                                <option value="pending">Pending</option>
                                                <option value="called">Called</option>
                                                <option value="interviewing">Interviewing</option>
                                                <option value="completed">Completed</option>
                                                <option value="skipped">Skipped</option>
                                            </select>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {tickets.length === 0 && <div className="text-center py-12 text-slate-500">No tickets found for this filter.</div>}
                    </div>
                </div>
            )}
        </div>
    );
}
