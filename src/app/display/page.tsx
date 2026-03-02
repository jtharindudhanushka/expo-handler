"use client";
import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase";

interface CompanyStatus {
    id: string;
    name: string;
    interview_date: string;
    interviewing: { full_name: string; student_number: string } | null;
    called: { full_name: string; student_number: string } | null;
    pendingCount: number;
}

export default function PublicDisplayBoard() {
    const [companies, setCompanies] = useState<CompanyStatus[]>([]);
    const [loading, setLoading] = useState(true);
    const [time, setTime] = useState(new Date());
    const supabase = createClient();
    const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

    const fetchData = async () => {
        // Fetch all companies
        const { data: comps } = await supabase
            .from("companies")
            .select("id, name, interview_date")
            .order("name");

        // Fetch all active tickets with registration info
        const { data: tickets } = await supabase
            .from("queue_tickets")
            .select("company_id, status, position, registration:registrations(full_name, student_number)")
            .in("status", ["pending", "called", "interviewing"]);

        // Build company status map
        const statusMap: Record<string, CompanyStatus> = {};
        for (const c of comps || []) {
            statusMap[c.id] = { ...c, interviewing: null, called: null, pendingCount: 0 };
        }

        for (const t of tickets || []) {
            const cs = statusMap[t.company_id];
            if (!cs) continue;
            const reg = (Array.isArray(t.registration) ? t.registration[0] : t.registration) as { full_name: string; student_number: string } | null;
            if (t.status === "interviewing") cs.interviewing = reg;
            else if (t.status === "called") cs.called = reg;
            else if (t.status === "pending") cs.pendingCount++;
        }

        setCompanies(Object.values(statusMap));
        setLoading(false);
    };

    useEffect(() => {
        fetchData();
        const timer = setInterval(() => setTime(new Date()), 1000);

        // Real-time subscription
        const channel = supabase
            .channel(`display-${Date.now()}`)
            .on("postgres_changes", { event: "*", schema: "public", table: "queue_tickets" }, () => fetchData())
            .subscribe();

        channelRef.current = channel;
        return () => { clearInterval(timer); channel.unsubscribe(); };
    }, []);

    const date = new Date("2026-03-03T00:00:00");
    const todayStr = `${date.getDate()} March 2026`;

    const hasActivity = companies.some(c => c.interviewing || c.called);

    return (
        <div className="min-h-screen bg-slate-950 flex flex-col font-sans select-none">
            {/* Header bar */}
            <header className="bg-gradient-to-r from-slate-900 to-indigo-950 border-b border-indigo-500/20 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_12px_rgba(16,185,129,0.8)]" />
                    <div>
                        <h1 className="text-white font-black text-xl tracking-tight">Career Fair 2026</h1>
                        <p className="text-indigo-300 text-xs font-medium uppercase tracking-widest">Interview Queue — Live Display</p>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-white font-mono text-2xl font-bold tabular-nums">
                        {time.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </p>
                    <p className="text-slate-400 text-xs">{time.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" })}</p>
                </div>
            </header>

            {/* Main content */}
            <div className="flex-1 p-4 md:p-6">
                {loading ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-slate-500 animate-pulse text-xl">Connecting to live feed...</div>
                    </div>
                ) : (
                    <>
                        {/* "Now Calling" hero — shown when someone is being called */}
                        {hasActivity && (
                            <div className="mb-5">
                                {companies.filter(c => c.called).map(c => (
                                    <div key={c.id + "-called"} className="mb-3 bg-indigo-600/20 border-2 border-indigo-500/60 rounded-2xl px-6 py-4 flex items-center justify-between animate-pulse-slow">
                                        <div>
                                            <p className="text-indigo-300 text-xs font-bold uppercase tracking-widest mb-1">📣 Now Calling</p>
                                            <p className="text-white text-3xl font-black">{c.called?.full_name}</p>
                                            <p className="text-slate-400 text-sm mt-0.5">{c.called?.student_number}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-indigo-200 text-sm font-semibold">Please proceed to</p>
                                            <p className="text-white text-xl font-black">{c.name}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Company grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {companies.map(c => {
                                const active = c.interviewing || c.called;
                                const statusColor = c.interviewing
                                    ? "border-emerald-500/50 bg-emerald-950/30"
                                    : c.called
                                        ? "border-indigo-500/50 bg-indigo-950/30"
                                        : "border-slate-700/50 bg-slate-900";

                                return (
                                    <div key={c.id} className={`rounded-2xl border-2 overflow-hidden transition-all duration-500 ${statusColor}`}>
                                        {/* Company header */}
                                        <div className={`px-4 py-3 border-b ${c.interviewing ? "bg-emerald-600/30 border-emerald-500/30" : c.called ? "bg-indigo-600/30 border-indigo-500/30" : "bg-slate-800/50 border-slate-700/30"}`}>
                                            <p className="text-white font-black text-base leading-tight truncate">{c.name}</p>
                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${c.interviewing ? "bg-emerald-400 animate-pulse" : c.called ? "bg-indigo-400 animate-pulse" : "bg-slate-500"}`} />
                                                <p className="text-xs font-semibold">
                                                    {c.interviewing
                                                        ? <span className="text-emerald-300">In Interview</span>
                                                        : c.called
                                                            ? <span className="text-indigo-300">Candidate Called</span>
                                                            : <span className="text-slate-400">Waiting for candidates</span>}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Status body */}
                                        <div className="px-4 py-3 space-y-2">
                                            {c.interviewing && (
                                                <div className="flex items-start gap-2">
                                                    <span className="mt-1 w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0 animate-pulse" />
                                                    <div>
                                                        <p className="text-white font-bold text-sm leading-tight">{c.interviewing.full_name}</p>
                                                        <p className="text-slate-400 text-xs">{c.interviewing.student_number}</p>
                                                    </div>
                                                </div>
                                            )}
                                            {c.called && !c.interviewing && (
                                                <div className="flex items-start gap-2">
                                                    <span className="mt-1 w-2 h-2 rounded-full bg-indigo-400 flex-shrink-0 animate-pulse" />
                                                    <div>
                                                        <p className="text-white font-bold text-sm leading-tight">{c.called.full_name}</p>
                                                        <p className="text-slate-400 text-xs">{c.called.student_number}</p>
                                                    </div>
                                                </div>
                                            )}
                                            {!active && (
                                                <p className="text-slate-600 text-xs italic">No active session</p>
                                            )}
                                            {/* Waiting count badge */}
                                            {c.pendingCount > 0 && (
                                                <div className="pt-1 border-t border-slate-700/30 mt-2">
                                                    <span className="text-xs text-slate-400">
                                                        <span className="font-bold text-amber-400">{c.pendingCount}</span> waiting in queue
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {companies.length === 0 && (
                            <div className="flex items-center justify-center h-64 text-slate-600 text-xl">No companies configured yet.</div>
                        )}
                    </>
                )}
            </div>

            {/* Footer */}
            <footer className="bg-slate-900/60 border-t border-slate-800 px-6 py-2 flex items-center justify-between text-xs text-slate-600">
                <span>Career Fair 2026 · Please wait for your name to be displayed</span>
                <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Live
                </span>
            </footer>
        </div>
    );
}
