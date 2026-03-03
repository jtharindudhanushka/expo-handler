"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { Maximize, Minimize, Volume2, VolumeX, Sparkles, MonitorSmartphone } from "lucide-react";

/* ─── Types ──────────────────────────────────────────────── */
interface Company { id: string; name: string; interview_date: string; room_number: string; }
interface ActiveTicket {
    company_id: string;
    status: string;
    person: { full_name: string; student_number: string } | null;
}
interface RegistrationView { full_name: string; student_number: string }
interface CompanyCard {
    id: string;
    name: string;
    room_number: string;
    interviewing: RegistrationView[];
    called: RegistrationView[];
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
    const [alertQueue, setAlertQueue] = useState<{ id: string; name: string; company: string }[]>([]);
    const [isAlerting, setIsAlerting] = useState(false);
    const [soundEnabled, setSoundEnabled] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);
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
            for (const c of comps ?? []) map[c.id] = { id: c.id, name: c.name, room_number: c.room_number, interviewing: [], called: [], pendingCount: 0 };

            let newAlerts: { id: string; name: string; company: string }[] = [];
            const currentCalledIds = new Set<string>();

            for (const t of tickets ?? []) {
                if (!map[t.company_id]) continue;
                const reg = (Array.isArray(t.registration) ? t.registration[0] : t.registration) as RegistrationView | null;

                if (reg) {
                    if (t.status === "interviewing") {
                        map[t.company_id].interviewing.push(reg);
                    } else if (t.status === "called") {
                        map[t.company_id].called.push(reg);
                        currentCalledIds.add(t.id);
                        if (!knownCalledTix.current.has(t.id)) {
                            newAlerts.push({ id: t.id, name: reg.full_name, company: map[t.company_id].name });
                        }
                    } else if (t.status === "pending") {
                        map[t.company_id].pendingCount++;
                    }
                }
            }

            setCards(Object.values(map));

            if (newAlerts.length > 0) {
                setAlertQueue(prev => {
                    const existingIds = new Set(prev.map(p => p.id));
                    const uniqueNew = newAlerts.filter(n => !existingIds.has(n.id));
                    return [...prev, ...uniqueNew];
                });
            } else if (currentCalledIds.size === 0 && alertQueue.length === 0 && !isAlerting) {
                setNowCalling(null);
            }

            knownCalledTix.current = currentCalledIds;
        } catch (error) {
            console.error("Fetch live data error:", error);
        }
    }, [selectedDate]);

    /* ── Effects ────────────────────────────────────────────── */
    useEffect(() => {
        if (alertQueue.length > 0 && !isAlerting) {
            setIsAlerting(true);
            const currentAlert = alertQueue[0];

            // Play sound effect
            if (soundEnabled && audioRef.current) {
                audioRef.current.currentTime = 0;
                audioRef.current.play().catch(e => console.log('Audio autoplay blocked:', e));
            }

            // Fade out current ticket, fade in new ticket
            setCalledVisible(false);
            setTimeout(() => {
                setNowCalling({ name: currentAlert.name, company: currentAlert.company });
                setCalledVisible(true);

                // Hold for 3 seconds before processing the next alert
                setTimeout(() => {
                    setAlertQueue(prev => prev.slice(1));
                    setIsAlerting(false);
                }, 3000);
            }, 400);
        }
    }, [alertQueue, isAlerting]);

    useEffect(() => {
        fetchData();
        const clock = setInterval(() => setTime(new Date()), 1000);
        // Fallback polling interval reduced to 1.5s to fix the up to 8sec delay if Realtime is disabled on the DB table.
        const poll = setInterval(fetchData, 1500);

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

    const cols = cards.length <= 4 ? "grid-cols-2 lg:grid-cols-2" : cards.length === 6 ? "grid-cols-2 lg:grid-cols-3" : "grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

    return (
        <div className="h-screen w-screen overflow-hidden bg-[#0A0A0B] flex flex-col font-sans select-none text-gray-100">

            {/* ── Header (Google/Gemini Minimalist) ───────────────────────── */}
            <header className="flex-shrink-0 bg-[#131314] border-b border-gray-800/60 px-6 py-4 flex items-center justify-between gap-6 z-10">
                <div className="flex items-center gap-6 min-w-0">
                    <div className="flex items-center gap-3">
                        <div>
                            <p className="font-medium text-lg text-gray-100 leading-tight tracking-tight">Career Fair Queue</p>
                            <p className="text-gray-400 text-xs font-medium tracking-wide">Live Updates</p>
                        </div>
                    </div>

                    {/* Dark Mode Pills */}
                    <div className="flex gap-1.5 bg-[#1E1F22] p-1 rounded-full border border-gray-800/50">
                        {DATES.map(d => (
                            <button
                                key={d.value}
                                onClick={() => setSelectedDate(d.value)}
                                className={`px-5 py-1.5 rounded-full text-sm font-medium transition-all duration-300 ease-out ${selectedDate === d.value ? "bg-gray-200 text-gray-900 shadow-sm scale-100" : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 scale-95 hover:scale-100"}`}
                            >
                                {d.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* "NOW CALLING" Hero */}
                <div className={`flex-1 min-w-0 mx-4 transition-all duration-500 ${calledVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"}`}>
                    {nowCalling ? (
                        <div className="bg-blue-500/10 border border-blue-500/20 rounded-full px-5 py-2.5 flex items-center justify-between max-w-2xl mx-auto shadow-[0_0_15px_rgba(59,130,246,0.1)]">
                            <div className="flex items-center gap-3 min-w-0">
                                <span className="relative flex h-3 w-3">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                                </span>
                                <span className="text-blue-300 text-xs font-bold uppercase tracking-widest shrink-0">Now Calling</span>
                                <span className="text-white font-medium text-xl truncate ml-1">{nowCalling.name}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 ml-4">
                                <span className="text-blue-400/80 font-medium">to</span>
                                <span className="bg-[#1E1F22] border border-blue-500/30 text-blue-300 px-4 py-1 rounded-full text-sm font-medium">{nowCalling.company}</span>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center text-gray-500 text-sm font-medium">Waiting for next call...</div>
                    )}
                </div>

                {/* Clock & Fullscreen */}
                <div className="flex-shrink-0 flex items-center gap-5 text-right">
                    <div>
                        <p className="font-mono text-2xl text-gray-100 font-medium tabular-nums tracking-tight">{time.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</p>
                        <p className="text-gray-500 text-xs font-medium">{time.toLocaleDateString("en-US", { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                    </div>
                    <button
                        onClick={() => {
                            setSoundEnabled(!soundEnabled);
                            // Pre-warm the persistent audio context on first click
                            if (!soundEnabled && audioRef.current) {
                                audioRef.current.volume = 0; // mute the initial ping
                                const playPromise = audioRef.current.play();
                                if (playPromise !== undefined) {
                                    playPromise.then(() => {
                                        if (audioRef.current) {
                                            audioRef.current.pause();
                                            audioRef.current.currentTime = 0;
                                            audioRef.current.volume = 1; // restore volume for actual alerts
                                        }
                                    }).catch(() => { });
                                }
                            }
                        }}
                        className={`p-2.5 rounded-full transition-colors border ${soundEnabled ? "bg-blue-500/10 border-blue-500/30 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.2)]" : "bg-[#1E1F22] hover:bg-gray-800 text-gray-500 border-gray-800/50"}`}
                        title={soundEnabled ? "Sound Enabled" : "Enable Sound"}
                    >
                        {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
                    </button>
                    <button
                        onClick={toggleFullscreen}
                        className="p-2.5 rounded-full bg-[#1E1F22] hover:bg-gray-800 text-gray-400 transition-colors border border-gray-800/50"
                        title="Toggle Fullscreen"
                    >
                        {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
                    </button>
                </div>
            </header>

            {/* Hidden Audio Element for reliable playback */}
            <audio ref={audioRef} src="/sfx/alert.mp3" preload="auto" />

            {/* ── Main Grid ───────────────────────────────────────── */}
            <div className={`flex-1 min-h-0 p-6 grid ${cols} gap-6 overflow-y-auto`}>
                {cards.length === 0 ? (
                    <div className="col-span-full flex flex-col items-center justify-center text-gray-600 h-full">
                        <MonitorSmartphone className="w-12 h-12 mb-4 opacity-30" />
                        <p className="text-lg font-medium">No schedule available for this date.</p>
                    </div>
                ) : cards.map(c => {
                    const hasInterview = c.interviewing.length > 0;
                    const hasCalled = c.called.length > 0;
                    const isActive = hasInterview || hasCalled;

                    return (
                        <div key={c.id} className={`rounded-[16px] overflow-hidden flex flex-col transition-all duration-300 ${isActive ? "bg-[#1E1F22] shadow-[0_4px_24px_-8px_rgba(0,0,0,0.5)] border border-gray-800/80" : "bg-transparent border border-gray-800/30"}`}>

                            {/* Card Header Minimal */}
                            <div className={`px-6 py-4 flex items-center justify-between border-b ${isActive ? "border-gray-800/50 bg-[#25262B]/50" : "border-gray-800/30 bg-[#131314]/30"}`}>
                                <h2 className={`font-semibold text-lg flex items-center gap-2 truncate ${isActive ? "text-gray-100" : "text-gray-400"}`}>
                                    <span>{c.name}</span>
                                    {c.room_number && (
                                        <>
                                            <span className="opacity-30 mx-1">—</span>
                                            <span className="text-[#FBBF24] font-bold tracking-wide uppercase text-sm drop-shadow-[0_0_8px_rgba(251,191,36,0.3)]">
                                                {c.room_number.replace(/Room /i, 'ROOM ')}
                                            </span>
                                        </>
                                    )}
                                </h2>
                                <div className="flex items-center gap-2 shrink-0">
                                    <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider w-fit flex items-center gap-2
                                        ${hasInterview ? "bg-green-500/10 text-green-400"
                                            : hasCalled ? "bg-blue-500/10 text-blue-400"
                                                : "bg-transparent text-gray-600"}`}>
                                        {isActive && <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${hasInterview ? 'bg-green-400' : 'bg-blue-400'}`} />}
                                        {hasInterview ? "In Session" : hasCalled ? "Arriving" : "Available"}
                                    </div>
                                    {c.pendingCount > 0 && (
                                        <div className={`px-2.5 py-1 rounded-md text-[10px] font-medium tracking-wide ${isActive ? "text-gray-400" : "text-gray-600"}`}>
                                            {c.pendingCount} in queue
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Card Body Ultra-Minimal */}
                            <div className={`px-6 pt-5 pb-6 flex-1 flex flex-col justify-center gap-6 relative bg-transparent ${isActive ? "" : "min-h-[160px]"}`}>
                                {!isActive && (
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <p className="text-gray-700 font-medium text-sm">Waiting for candidates</p>
                                    </div>
                                )}

                                {hasInterview && (
                                    <div className="flex flex-col gap-3">
                                        <div className="flex items-center gap-2">
                                            <span className="relative flex h-2 w-2">
                                                <span className="animate-ping absolute h-full w-full rounded-full bg-green-500/50"></span>
                                                <span className="relative rounded-full h-2 w-2 bg-green-500"></span>
                                            </span>
                                            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Current Session</p>
                                        </div>
                                        {c.interviewing.map((reg, idx) => (
                                            <div key={idx} className="flex flex-col min-w-0">
                                                <p className={`font-medium tracking-tight leading-none truncate text-gray-100 ${c.interviewing.length > 2 ? 'text-lg' : 'text-[22px]'}`}>
                                                    {reg.full_name}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {hasCalled && (
                                    <div className={`flex flex-col gap-3 ${hasInterview ? "mt-4 border-t border-gray-800/40 pt-4" : "mt-auto"}`}>
                                        <div className={`flex items-center gap-2 ${hasInterview ? 'mt-2 border-t border-gray-800/40 pt-3' : 'mt-auto'}`}>
                                            <Volume2 className="w-4 h-4 text-blue-500 animate-pulse shrink-0" />
                                            <p className="text-[11px] font-bold text-blue-500 uppercase tracking-widest truncate">Next Up to Room</p>
                                        </div>
                                        {c.called.map((reg, idx) => (
                                            <div key={idx} className="flex flex-col gap-1 min-w-0">
                                                <p className={`font-bold text-blue-400 truncate tracking-tight leading-none ${c.called.length > 2 ? 'text-base' : 'text-xl'}`}>
                                                    {reg.full_name}
                                                </p>
                                                {c.called.length <= 2 && (
                                                    <p className="text-gray-500 text-xs truncate">{reg.student_number}</p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* ── Footer ─────────────────────────────────────────── */}
            <footer className="flex-shrink-0 bg-[#0A0A0B] px-6 py-4 flex items-center justify-between text-xs text-gray-500 font-medium border-t border-gray-900">
                <span>Wait in the designated area until your name appears as Next Up to Room</span>
                <span className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500/80 animate-pulse shadow-[0_0_5px_rgba(34,197,94,0.5)]" />
                    Live System Active
                </span>
            </footer>
        </div>
    );
}
