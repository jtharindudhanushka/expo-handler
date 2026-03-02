"use client";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase";

interface CalledTicket {
    id: string;
    status: string;
    registration?: { full_name: string; student_number: string };
    company?: { name: string; room_number: string };
}

export default function PublicBoard() {
    const [tickets, setTickets] = useState<CalledTicket[]>([]);
    const [loading, setLoading] = useState(true);
    const [time, setTime] = useState(new Date());
    const supabase = createClient();

    const fetchTickets = useCallback(async () => {
        const { data } = await supabase
            .from("queue_tickets")
            .select("*, registration:registrations(full_name, student_number), company:companies(name, room_number)")
            .in("status", ["called", "interviewing"])
            .order("created_at", { ascending: false });
        setTickets(data || []);
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchTickets();
        // Tick clock
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, [fetchTickets]);

    // Real-time
    useEffect(() => {
        const channel = supabase
            .channel("board-realtime")
            .on("postgres_changes", { event: "*", schema: "public", table: "queue_tickets" }, () => fetchTickets())
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [fetchTickets]);

    return (
        <div className="min-h-screen bg-slate-950 flex flex-col font-sans">
            {/* Top bar */}
            <header className="bg-slate-900/80 backdrop-blur border-b border-slate-700/30 px-8 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_12px_rgba(16,185,129,0.7)]" />
                    <span className="text-slate-300 font-bold text-lg uppercase tracking-widest">Career Fair 2026 — Live Board</span>
                </div>
                <span className="text-slate-400 font-mono text-lg">
                    {time.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
            </header>

            <div className="flex-1 p-6 md:p-12">
                <div className="text-center mb-12">
                    <h1 className="text-6xl md:text-8xl font-black text-white tracking-tight">NOW CALLING</h1>
                    <p className="text-xl text-slate-400 mt-4">Please proceed to your designated room when your name appears</p>
                </div>

                {loading ? (
                    <div className="text-slate-600 text-3xl font-bold text-center mt-24 animate-pulse">Connecting to live board...</div>
                ) : tickets.length === 0 ? (
                    <div className="flex flex-col items-center justify-center mt-24 space-y-4">
                        <div className="w-24 h-24 rounded-full border-2 border-dashed border-slate-700 flex items-center justify-center">
                            <svg className="w-10 h-10 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <p className="text-3xl text-slate-700 font-bold">Waiting for next candidate...</p>
                    </div>
                ) : (
                    <div className="max-w-[1400px] mx-auto grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {tickets.map(ticket => (
                            <div
                                key={ticket.id}
                                className={`rounded-3xl overflow-hidden shadow-2xl ring-1 transition-all duration-500 ${ticket.status === "interviewing"
                                        ? "bg-emerald-950/50 ring-emerald-500/40 shadow-emerald-500/10"
                                        : "bg-slate-900 ring-white/10 shadow-slate-900"
                                    }`}
                            >
                                {/* Room badge header */}
                                <div className={`px-6 py-4 flex items-center justify-between ${ticket.status === "interviewing" ? "bg-emerald-600" : "bg-indigo-600"}`}>
                                    <span className="text-white/80 font-bold uppercase tracking-widest text-sm">
                                        {ticket.status === "interviewing" ? "In Interview" : "Proceed To"}
                                    </span>
                                    <span className="text-white font-black text-2xl">{ticket.company?.room_number || "—"}</span>
                                </div>

                                <div className="p-8">
                                    <h2 className="text-4xl md:text-5xl font-black text-white tracking-tight truncate">
                                        {ticket.registration?.full_name}
                                    </h2>
                                    <div className="mt-4 flex items-center gap-3">
                                        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${ticket.status === "interviewing" ? "bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" : "bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]"}`} />
                                        <span className="text-2xl text-slate-300 font-bold">{ticket.company?.name}</span>
                                    </div>
                                    <p className="mt-2 text-slate-600 text-sm">{ticket.registration?.student_number}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Footer */}
            <footer className="bg-slate-900/50 border-t border-slate-800 px-8 py-3 flex items-center justify-between">
                <p className="text-slate-600 text-sm">Career Fair 2026 · Queue Management System</p>
                <p className="text-slate-600 text-xs">
                    {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                </p>
            </footer>
        </div>
    );
}
