"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { LogOut, Search, UserCheck, UserX, Sparkles, Building2 } from "lucide-react";

interface Registration {
    id: string;
    full_name: string;
    student_number: string;
    email: string;
    level: string;
    is_present: boolean;
}

export default function ReceptionDashboard() {
    const [registrations, setRegistrations] = useState<Registration[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [loading, setLoading] = useState(true);
    const [profile, setProfile] = useState<{ full_name: string; role: string } | null>(null);
    const [filterPresent, setFilterPresent] = useState<"all" | "present" | "away">("all");

    const router = useRouter();
    const supabase = createClient();
    const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

    // Initialization & Auth
    useEffect(() => {
        const init = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { router.push("/login"); return; }
            const { data: p } = await supabase.from("profiles").select("full_name, role").eq("id", user.id).single();
            setProfile(p);

            // Allow admins and potentially a new 'receptionist' role
            if (p?.role !== "admin" && p?.role !== "receptionist") {
                router.push("/login");
                return;
            }
            fetchRegistrations();
        };
        init();
    }, [router, supabase]);

    const fetchRegistrations = useCallback(async () => {
        const { data } = await supabase
            .from("registrations")
            .select("id, full_name, student_number, email, level, is_present")
            .order("full_name", { ascending: true });

        setRegistrations((data || []) as Registration[]);
        setLoading(false);
    }, [supabase]);

    // Live Socket listener for other receptionists editing
    useEffect(() => {
        if (!profile) return;
        if (channelRef.current) channelRef.current.unsubscribe();

        const channel = supabase
            .channel(`reception-live-${Date.now()}`)
            .on("postgres_changes", { event: "*", schema: "public", table: "registrations" }, () => fetchRegistrations())
            .subscribe();

        channelRef.current = channel;
        return () => { channel.unsubscribe(); };
    }, [profile, fetchRegistrations, supabase]);


    const toggleAttendance = async (reg: Registration) => {
        // Optimistic UI update
        const originalState = reg.is_present;
        const newState = !originalState;

        setRegistrations(prev => prev.map(r => r.id === reg.id ? { ...r, is_present: newState } : r));

        try {
            const res = await fetch("/api/reception/mark-present", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ registrationId: reg.id, isPresent: newState }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to mark attendance");
        } catch (err: any) {
            alert(`Error: ${err.message}`);
            // Rollback optimistic update on failure
            setRegistrations(prev => prev.map(r => r.id === reg.id ? { ...r, is_present: originalState } : r));
        }
    };

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        router.push("/login");
    };

    if (loading) return (
        <div className="min-h-screen bg-[#0A0A0B] flex items-center justify-center">
            <div className="text-gray-500 font-medium flex items-center gap-3">
                <Sparkles className="w-5 h-5 animate-pulse text-blue-500" />
                Loading reception data...
            </div>
        </div>
    );

    const filteredRegs = registrations.filter(r => {
        const matchesSearch = r.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            r.student_number?.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesFilter = filterPresent === "all" ? true :
            filterPresent === "present" ? r.is_present : !r.is_present;
        return matchesSearch && matchesFilter;
    });

    const totalCount = registrations.length;
    const presentCount = registrations.filter(r => r.is_present).length;

    return (
        <div className="min-h-screen bg-[#0A0A0B] text-gray-100 font-sans selection:bg-blue-500/30">
            {/* Topbar */}
            <header className="sticky top-0 z-20 bg-[#0A0A0B]/80 backdrop-blur-xl border-b border-gray-800/60 px-4 md:px-6 py-3.5 flex items-center justify-between transition-all">
                <div className="flex items-center gap-3.5">
                    <div>
                        <h1 className="font-medium text-sm leading-tight tracking-wide text-gray-100">Reception Attendance</h1>
                        {profile && <p className="text-gray-500 text-[11px] font-medium tracking-wide mt-0.5">{profile.full_name}</p>}
                    </div>
                </div>
                <div className="flex items-center gap-1.5 md:gap-3">
                    <button onClick={handleSignOut} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-400 hover:text-gray-200 hover:bg-[#1E1F22] rounded-full transition-colors">
                        <LogOut className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Sign Out</span>
                    </button>
                </div>
            </header>

            <main className="max-w-4xl mx-auto p-4 md:px-8 md:py-10 space-y-8 pb-24">

                {/* Metrics */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-[#131314] border border-gray-800/60 rounded-[20px] p-5 flex flex-col items-center justify-center">
                        <span className="text-3xl font-medium text-white">{presentCount}</span>
                        <span className="text-xs font-semibold uppercase tracking-widest text-green-500 mt-2">Arrived Candidates</span>
                    </div>
                    <div className="bg-[#131314] border border-gray-800/60 rounded-[20px] p-5 flex flex-col items-center justify-center">
                        <span className="text-3xl font-medium text-gray-400">{totalCount - presentCount}</span>
                        <span className="text-xs font-semibold uppercase tracking-widest text-gray-500 mt-2">Pending Arrival</span>
                    </div>
                </div>

                {/* Search and Filters */}
                <div className="flex flex-col sm:flex-row gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <input
                            type="text"
                            placeholder="Search by Name or Student ID..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full h-12 pl-11 pr-4 bg-[#131314] border border-gray-800/60 rounded-2xl text-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all placeholder:text-gray-600"
                        />
                    </div>
                    <div className="flex gap-2">
                        {(["all", "present", "away"] as const).map(f => (
                            <button key={f} onClick={() => setFilterPresent(f)}
                                className={`px-5 h-12 rounded-2xl text-xs font-bold uppercase tracking-widest transition-all
                                ${filterPresent === f ? "bg-blue-500 text-white" : "bg-[#131314] border border-gray-800/60 text-gray-400 hover:bg-[#1A1B1E]"}`}
                            >
                                {f}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Candidate List */}
                <div className="bg-[#131314] border border-gray-800/60 rounded-[28px] overflow-hidden">
                    {filteredRegs.length === 0 ? (
                        <div className="p-10 text-center">
                            <p className="text-sm text-gray-500 font-medium">No candidates found.</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-800/50">
                            {filteredRegs.map((reg) => (
                                <div key={reg.id} className="p-4 sm:p-5 flex items-center justify-between gap-4 hover:bg-[#1A1B1E] transition-colors">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-3">
                                            <p className={`text-base font-medium truncate ${reg.is_present ? "text-gray-100" : "text-gray-400"}`}>
                                                {reg.full_name}
                                            </p>
                                            {reg.is_present && (
                                                <span className="px-2 py-0.5 rounded-md bg-green-500/20 text-green-400 text-[10px] font-bold uppercase tracking-widest border border-green-500/20">Present</span>
                                            )}
                                        </div>
                                        <p className="text-[13px] text-gray-500 mt-0.5 truncate">{reg.student_number} <span className="mx-1.5 opacity-40">|</span> {reg.level}</p>
                                    </div>

                                    <button
                                        onClick={() => toggleAttendance(reg)}
                                        className={`shrink-0 flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all
                                        ${reg.is_present
                                                ? "bg-green-500/10 hover:bg-red-500/10 text-green-500 hover:text-red-400 border border-green-500/20 hover:border-red-500/20"
                                                : "bg-[#1E1F22] hover:bg-blue-500 hover:text-white text-gray-400 border border-gray-800 shadow-sm"}`}
                                    >
                                        {reg.is_present ? (
                                            <>
                                                <UserCheck className="w-4 h-4" /> <span className="hidden sm:inline">Mark Away</span>
                                            </>
                                        ) : (
                                            <>
                                                <UserCheck className="w-4 h-4" /> <span className="hidden sm:inline">Mark Present</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
