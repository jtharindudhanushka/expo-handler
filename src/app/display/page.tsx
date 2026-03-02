"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase";

/* ─── Types ──────────────────────────────────────────────── */
interface Company { id: string; name: string; interview_date: string }
interface ActiveTicket {
    company_id: string;
    status: string;
    person: { full_name: string; student_number: string } | null;
}
interface CompanyCard {
    id: string;
    name: string;
    interviewing: { full_name: string; student_number: string } | null;
    called: { full_name: string; student_number: string } | null;
    pendingCount: number;
}

/* ─── Date helpers ───────────────────────────────────────── */
const DATES = [
    { label: "March 3", value: "2026-03-03" },
    { label: "March 4", value: "2026-03-04" },
];
// Auto-pick today's date, defaulting to March 3
function defaultDate(): string {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    return DATES.find(d => d.value === today)?.value ?? DATES[0].value;
}

/* ─── Component ──────────────────────────────────────────── */
export default function DisplayBoard() {
    const [selectedDate, setSelectedDate] = useState(defaultDate);
    const [cards, setCards] = useState<CompanyCard[]>([]);
    const [nowCalling, setNowCalling] = useState<{ name: string; company: string } | null>(null);
    const [calledVisible, setCalledVisible] = useState(true);
    const [time, setTime] = useState(new Date());
    const [isFullscreen, setIsFullscreen] = useState(false);
    const knownCalledTix = useRef<Set<string>>(new Set());

    // Stable supabase client
    const supabaseRef = useRef(createClient());
    const supabase = supabaseRef.current;

    /* ── Data fetch ─────────────────────────────────────────── */
    const fetchData = useCallback(async () => {
        try {
            const res = await fetch(`/api/display/live?date=${selectedDate}`);
            if (!res.ok) return;
            const { companies: comps, tickets } = await res.json();

            const map: Record<string, CompanyCard> = {};
            for (const c of comps ?? []) map[c.id] = { id: c.id, name: c.name, interviewing: null, called: null, pendingCount: 0 };

            let newCalledTicket: { name: string; company: string } | null = null;
            const currentCalledIds = new Set<string>();

            for (const t of tickets ?? []) {
                if (!map[t.company_id]) continue;
                const reg = (Array.isArray(t.registration) ? t.registration[0] : t.registration) as { full_name: string; student_number: string } | null;

                if (t.status === "interviewing") {
                    map[t.company_id].interviewing = reg;
                } else if (t.status === "called") {
                    map[t.company_id].called = reg;
                    currentCalledIds.add(t.id);
                    // Detect if this is a newly called ticket we haven't seen before
                    if (reg && !knownCalledTix.current.has(t.id)) {
                        newCalledTicket = { name: reg.full_name, company: map[t.company_id].name };
                    }
                } else if (t.status === "pending") {
                    map[t.company_id].pendingCount++;
                }
            }

            setCards(Object.values(map));

            // Animate "Now Calling" when a new person is called
            if (newCalledTicket) {
                setCalledVisible(false);
                setTimeout(() => {
                    setNowCalling(newCalledTicket);
                    setCalledVisible(true);
                }, 400);
            } else if (currentCalledIds.size === 0) {
                setNowCalling(null);
            }

            // Sync our known called tickets state
            knownCalledTix.current = currentCalledIds;
        } catch (error) {
            console.error("Fetch live data error:", error);
        }
    }, [selectedDate]);

    /* ── Effects ────────────────────────────────────────────── */
    useEffect(() => {
        fetchData();
        const clock = setInterval(() => setTime(new Date()), 1000);
        // Polling fallback: refresh every 5 s regardless of realtime
        const poll = setInterval(fetchData, 5000);

        // Supabase Realtime — subscribe to ALL queue_tickets changes
        const ch = supabase
            .channel(`display-${selectedDate}-${Date.now()}`)
            .on("postgres_changes", { event: "*", schema: "public", table: "queue_tickets" }, fetchData)
            .subscribe((status) => console.log("[display-rt]", status));

        return () => {
            clearInterval(clock);
            clearInterval(poll);
            ch.unsubscribe();
            document.removeEventListener("fullscreenchange", handleFsChange);
        };
    }, [fetchData]);

    const handleFsChange = () => {
        setIsFullscreen(!!document.fullscreenElement);
    };

    useEffect(() => {
        document.addEventListener("fullscreenchange", handleFsChange);
        return () => document.removeEventListener("fullscreenchange", handleFsChange);
    }, []);

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.error(`Error attempting to enable fullscreen: ${err.message}`);
            });
        } else {
            document.exitFullscreen();
        }
    };

    /* ── Layout helpers ─────────────────────────────────────── */
    const cols = cards.length <= 4 ? "grid-cols-2" : "grid-cols-3";

    return (
        <div className="h-screen w-screen overflow-hidden bg-slate-950 flex flex-col font-sans select-none">

            {/* ── Header ─────────────────────────────────────────── */}
            <header className="flex-shrink-0 bg-slate-900 border-b border-slate-700/50 px-5 py-3 flex items-center justify-between gap-4">
                {/* Branding + date tabs */}
                <div className="flex items-center gap-4 min-w-0">
                    <div>
                        <p className="text-white font-black text-base leading-none">Career Fair 2026</p>
                        <p className="text-indigo-400 text-xs font-semibold uppercase tracking-widest">Live Queue Display</p>
                    </div>
                    <div className="flex gap-1.5">
                        {DATES.map(d => (
                            <button
                                key={d.value}
                                onClick={() => setSelectedDate(d.value)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${selectedDate === d.value ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30" : "bg-slate-800 text-slate-400 hover:bg-slate-700"}`}
                            >
                                {d.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* "NOW CALLING" animated hero */}
                <div
                    className={`flex-1 min-w-0 mx-4 transition-all duration-400 ${calledVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"}`}
                    style={{ transition: "opacity 0.4s ease, transform 0.4s ease" }}
                >
                    {nowCalling ? (
                        <div className="bg-indigo-600/20 border border-indigo-500/40 rounded-xl px-4 py-2 flex items-center justify-between">
                            <div className="flex items-center gap-2.5 min-w-0">
                                <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-pulse flex-shrink-0" />
                                <span className="text-indigo-300 text-xs font-bold uppercase tracking-widest flex-shrink-0">NOW CALLING</span>
                                <span className="text-white font-black text-lg truncate">{nowCalling.name}</span>
                            </div>
                            <span className="text-indigo-200 text-sm font-semibold flex-shrink-0 ml-3">→ {nowCalling.company}</span>
                        </div>
                    ) : (
                        <div className="text-center text-slate-700 text-sm">Waiting for next call...</div>
                    )}
                </div>

                {/* Clock & Fullscreen */}
                <div className="flex-shrink-0 flex items-center gap-4 text-right">
                    <div>
                        <p className="text-white font-mono text-xl font-bold tabular-nums">{time.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</p>
                        <p className="text-slate-500 text-xs">{DATES.find(d => d.value === selectedDate)?.label}</p>
                    </div>
                    <button
                        onClick={toggleFullscreen}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors border border-slate-700/50"
                        title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
                    >
                        {isFullscreen ? (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 15v-4H5m10 4v-4h4m-4-6h-4v4M9 5v4H5" /></svg>
                        ) : (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                        )}
                    </button>
                </div>
            </header>

            {/* ── Company grid — fills remaining height ─────────── */}
            <div className={`flex-1 min-h-0 p-3 grid ${cols} gap-3`}>
                {cards.length === 0 ? (
                    <div className="col-span-full flex items-center justify-center text-slate-700 text-xl">
                        No companies scheduled for this date.
                    </div>
                ) : cards.map(c => {
                    const hasInterview = !!c.interviewing;
                    const hasCalled = !!c.called;
                    const isActive = hasInterview || hasCalled;

                    return (
                        <div
                            key={c.id}
                            className={`flex flex-col rounded-2xl border-2 overflow-hidden transition-all duration-500 ${hasInterview ? "border-emerald-500/60 bg-emerald-950/40"
                                : hasCalled ? "border-indigo-500/60 bg-indigo-950/30"
                                    : "border-slate-700/40 bg-slate-900/60"
                                }`}
                        >
                            {/* Card header — company name & status */}
                            <div className={`flex-shrink-0 px-4 py-2.5 border-b flex items-center justify-between ${hasInterview ? "bg-emerald-700/30 border-emerald-600/30"
                                : hasCalled ? "bg-indigo-700/30 border-indigo-600/30"
                                    : "bg-slate-800/60 border-slate-700/30"
                                }`}>
                                <p className="text-white font-black text-sm leading-tight truncate">{c.name}</p>
                                <span className={`flex items-center gap-1.5 text-xs font-bold flex-shrink-0 ml-2 ${hasInterview ? "text-emerald-300" : hasCalled ? "text-indigo-300" : "text-slate-500"
                                    }`}>
                                    {isActive && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
                                    {hasInterview ? "In Interview" : hasCalled ? "Called" : "Waiting"}
                                </span>
                            </div>

                            {/* Card body — person info */}
                            <div className="flex-1 flex flex-col justify-center px-4 py-3 gap-1.5">
                                {c.interviewing && (
                                    <div className="space-y-0.5">
                                        <p className="text-xs text-emerald-400 font-semibold uppercase tracking-wide">Interviewing</p>
                                        <p className="text-white font-black text-lg leading-tight">{c.interviewing.full_name}</p>
                                        <p className="text-slate-400 text-xs">{c.interviewing.student_number}</p>
                                    </div>
                                )}
                                {c.called && (
                                    <div className={`space-y-0.5 ${c.interviewing ? "border-t border-slate-700/50 pt-2 mt-1" : ""}`}>
                                        <p className="text-xs text-indigo-400 font-semibold uppercase tracking-wide">
                                            {c.interviewing ? "Next up" : "Please proceed"}
                                        </p>
                                        <p className={`font-bold leading-tight ${c.interviewing ? "text-indigo-200 text-sm" : "text-white text-lg"}`}>{c.called.full_name}</p>
                                        <p className="text-slate-500 text-xs">{c.called.student_number}</p>
                                    </div>
                                )}
                                {!isActive && (
                                    <p className="text-slate-600 text-sm italic">No active session</p>
                                )}
                            </div>

                            {/* Footer — queue count */}
                            {c.pendingCount > 0 && (
                                <div className="flex-shrink-0 px-4 py-2 border-t border-slate-800/60 flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                    <span className="text-xs text-slate-500">{c.pendingCount} waiting</span>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* ── Footer ─────────────────────────────────────────── */}
            <footer className="flex-shrink-0 bg-slate-900/60 border-t border-slate-800 px-5 py-1.5 flex items-center justify-between text-xs text-slate-600">
                <span>Please proceed to your company when your name appears above</span>
                <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Live · refreshes automatically
                </span>
            </footer>
        </div>
    );
}
