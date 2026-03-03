"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { Maximize, Minimize, Volume2, MonitorPlay } from "lucide-react";

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
                    if (reg && !knownCalledTix.current.has(t.id)) {
                        newCalledTicket = { name: reg.full_name, company: map[t.company_id].name };
                    }
                } else if (t.status === "pending") {
                    map[t.company_id].pendingCount++;
                }
            }

            setCards(Object.values(map));

            if (newCalledTicket) {
                setCalledVisible(false);
                setTimeout(() => {
                    setNowCalling(newCalledTicket);
                    setCalledVisible(true);
                }, 400);
            } else if (currentCalledIds.size === 0) {
                setNowCalling(null);
            }

            knownCalledTix.current = currentCalledIds;
        } catch (error) {
            console.error("Fetch live data error:", error);
        }
    }, [selectedDate]);

    /* ── Effects ────────────────────────────────────────────── */
    useEffect(() => {
        fetchData();
        const clock = setInterval(() => setTime(new Date()), 1000);
        const poll = setInterval(fetchData, 5000);

        const ch = supabase
            .channel(`display-${selectedDate}-${Date.now()}`)
            .on("postgres_changes", { event: "*", schema: "public", table: "queue_tickets" }, fetchData)
            .subscribe();

        return () => {
            clearInterval(clock);
            clearInterval(poll);
            ch.unsubscribe();
            document.removeEventListener("fullscreenchange", handleFsChange);
        };
    }, [fetchData, selectedDate, supabase]);

    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);

    useEffect(() => {
        document.addEventListener("fullscreenchange", handleFsChange);
        return () => document.removeEventListener("fullscreenchange", handleFsChange);
    }, []);

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(console.error);
        } else {
            document.exitFullscreen();
        }
    };

    // Optimizing layout: if 6 companies, use 3 columns evenly. 
    const cols = cards.length <= 4 ? "grid-cols-2" : cards.length === 6 ? "grid-cols-2 lg:grid-cols-3" : "grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

    return (
        <div className="h-screen w-screen overflow-hidden bg-stone-50 flex flex-col font-sans select-none text-stone-900">

            {/* ── Header ─────────────────────────────────────────── */}
            <header className="flex-shrink-0 bg-white border-b border-stone-200 px-6 py-4 flex items-center justify-between gap-6 shadow-sm z-10">
                <div className="flex items-center gap-6 min-w-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-stone-900 flex items-center justify-center">
                            <MonitorPlay className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <p className="font-bold text-lg leading-tight tracking-tight">Career Fair Queue</p>
                            <p className="text-stone-500 text-xs font-medium uppercase tracking-wider">Live Status</p>
                        </div>
                    </div>
                    {/* Notion-style Pill Toggles */}
                    <div className="flex gap-1.5 bg-stone-100/80 p-1 rounded-xl border border-stone-200/60 shadow-inner">
                        {DATES.map(d => (
                            <button
                                key={d.value}
                                onClick={() => setSelectedDate(d.value)}
                                className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ease-out ${selectedDate === d.value ? "bg-white text-stone-900 shadow-sm border border-stone-200/50 scale-100" : "text-stone-500 hover:text-stone-700 hover:bg-stone-200/40 scale-95 hover:scale-100"}`}
                            >
                                {d.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* "NOW CALLING" Hero */}
                <div className={`flex-1 min-w-0 mx-4 transition-all duration-500 ${calledVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"}`}>
                    {nowCalling ? (
                        <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-2.5 flex items-center justify-between shadow-sm max-w-2xl mx-auto">
                            <div className="flex items-center gap-3 min-w-0">
                                <span className="relative flex h-3 w-3">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-600"></span>
                                </span>
                                <span className="text-blue-700 text-xs font-bold uppercase tracking-widest shrink-0">Now Calling</span>
                                <span className="text-stone-900 font-extrabold text-xl truncate ml-1">{nowCalling.name}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 ml-4">
                                <span className="text-blue-600 font-medium">to</span>
                                <span className="bg-white border text-blue-800 border-blue-200 px-3 py-1 rounded-md text-sm font-bold shadow-sm">{nowCalling.company}</span>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center text-stone-400 text-sm font-medium">Waiting for next call...</div>
                    )}
                </div>

                {/* Clock & Fullscreen */}
                <div className="flex-shrink-0 flex items-center gap-5 text-right">
                    <div>
                        <p className="font-mono text-2xl font-bold tabular-nums tracking-tight">{time.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</p>
                        <p className="text-stone-500 text-xs font-medium">{time.toLocaleDateString("en-US", { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                    </div>
                    <button
                        onClick={toggleFullscreen}
                        className="p-2.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-600 transition-colors border border-stone-200"
                        title="Toggle Fullscreen"
                    >
                        {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
                    </button>
                </div>
            </header>

            {/* ── Main Grid ───────────────────────────────────────── */}
            <div className={`flex-1 min-h-0 p-6 grid ${cols} gap-6 overflow-y-auto`}>
                {cards.length === 0 ? (
                    <div className="col-span-full flex flex-col items-center justify-center text-stone-400 h-full">
                        <MonitorPlay className="w-12 h-12 mb-4 opacity-50" />
                        <p className="text-lg font-medium">No schedule available for this date.</p>
                    </div>
                ) : cards.map(c => {
                    const hasInterview = !!c.interviewing;
                    const hasCalled = !!c.called;
                    const isActive = hasInterview || hasCalled;

                    return (
                        <div key={c.id} className={`rounded-2xl border ${isActive ? "border-stone-300 shadow-md ring-1 ring-stone-900/5 bg-white scale-[1.01]" : "border-stone-200 bg-stone-50/50 opacity-90"} overflow-hidden flex flex-col transition-all duration-300`}>

                            {/* Card Header */}
                            <div className={`px-5 py-4 border-b ${hasInterview ? "bg-stone-900 border-stone-800" : hasCalled ? "bg-stone-800 border-stone-700" : "bg-stone-100 border-stone-200"}`}>
                                <h2 className={`font-extrabold text-xl truncate ${isActive ? "text-white" : "text-stone-900"}`}>{c.name}</h2>
                                <div className="flex items-center gap-2 mt-2">
                                    <div className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest w-fit flex items-center gap-1.5
                                        ${hasInterview ? "bg-green-500/20 text-green-300"
                                            : hasCalled ? "bg-blue-500/20 text-blue-300"
                                                : "bg-stone-200 text-stone-600"}`}>
                                        {isActive && <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${hasInterview ? 'bg-green-400' : 'bg-blue-400'}`} />}
                                        {hasInterview ? "In Session" : hasCalled ? "Arriving" : "Available"}
                                    </div>
                                    {c.pendingCount > 0 && (
                                        <div className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest border ${isActive ? "bg-white/10 text-stone-300 border-white/10" : "bg-stone-200 text-stone-600 border-stone-300"}`}>
                                            {c.pendingCount} in queue
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Card Body */}
                            <div className="p-5 flex-1 flex flex-col justify-center gap-3 relative bg-white">
                                {!isActive && (
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <p className="text-stone-400 font-semibold text-sm uppercase tracking-widest">Waiting for candidates</p>
                                    </div>
                                )}

                                {c.interviewing && (
                                    <div className={`rounded-xl p-4 border relative overflow-hidden ${hasCalled ? 'bg-stone-100 border-stone-200' : 'bg-green-50 border-green-200 shadow-inner'}`}>
                                        <p className={`text-[10px] font-extrabold uppercase tracking-widest mb-1 ${hasCalled ? 'text-stone-500' : 'text-green-700'}`}>Current Interview</p>
                                        <p className={`font-black truncate ${hasCalled ? 'text-xl text-stone-800' : 'text-3xl text-stone-900 tracking-tight'}`}>{c.interviewing.full_name}</p>
                                        <p className="text-stone-600 font-semibold mt-1">{c.interviewing.student_number}</p>
                                    </div>
                                )}

                                {c.called && (
                                    <div className="rounded-xl p-5 bg-blue-50/80 border-2 border-blue-200 relative overflow-hidden shadow-sm">
                                        <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-500" />
                                        <p className="text-[11px] font-extrabold text-blue-700 uppercase tracking-widest mb-1 flex items-center gap-1.5 ml-2">
                                            <Volume2 className="w-4 h-4 animate-pulse" /> Next Up to Room
                                        </p>
                                        <p className="font-black text-2xl text-stone-900 truncate ml-2 tracking-tight">{c.called.full_name}</p>
                                        <p className="text-stone-600 font-semibold mt-1 ml-2">{c.called.student_number}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* ── Footer ─────────────────────────────────────────── */}
            <footer className="flex-shrink-0 bg-stone-900 px-6 py-2.5 flex items-center justify-between text-xs text-stone-400 font-medium">
                <span className="text-stone-300">Wait in designated area until your name appears as Next Up</span>
                <span className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    Live System Active
                </span>
            </footer>
        </div>
    );
}
