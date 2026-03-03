"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { LogOut, Search, UserCheck, UserX, Sparkles, Building2, Download } from "lucide-react";

interface Registration {
    id: string;
    full_name: string;
    student_number: string;
    email: string;
    level: string;
    faculty?: string;
    department?: string;
    employment_type?: string;
    job_opportunities?: string;
    is_present: boolean;
}

interface Company { id: string; name: string; room_number: string; }
interface QueueTicket { id: string; company_id: string; status: string; }

export default function ReceptionDashboard() {
    const [registrations, setRegistrations] = useState<Registration[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [loading, setLoading] = useState(true);
    const [profile, setProfile] = useState<{ full_name: string; role: string } | null>(null);
    const [filterPresent, setFilterPresent] = useState<"all" | "present" | "away">("all");

    // Queue Management State
    const [activeTab, setActiveTab] = useState<"attendance" | "queues">("attendance");
    const [companies, setCompanies] = useState<Company[]>([]);
    const [editingRegId, setEditingRegId] = useState<string | null>(null);
    const [candidateTickets, setCandidateTickets] = useState<QueueTicket[]>([]);
    const [ticketsToRemove, setTicketsToRemove] = useState<Set<string>>(new Set());
    const [companiesToAdd, setCompaniesToAdd] = useState<Set<string>>(new Set());
    const [selectedAddCompany, setSelectedAddCompany] = useState<string>("");
    const [savingQueues, setSavingQueues] = useState(false);

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
            fetchCompanies();
        };
        init();
    }, [router, supabase]);

    const fetchCompanies = async () => {
        const { data } = await supabase.from("companies").select("*").order("name");
        if (data) setCompanies(data);
    };

    const fetchRegistrations = useCallback(async () => {
        const { data } = await supabase
            .from("registrations")
            .select("id, full_name, student_number, email, level, faculty, department, employment_type, job_opportunities, is_present")
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
        const matchesFilter = activeTab === "queues" ? true : (filterPresent === "all" ? true :
            filterPresent === "present" ? r.is_present : !r.is_present);
        return matchesSearch && matchesFilter;
    });

    const totalCount = registrations.length;
    const presentCount = registrations.filter(r => r.is_present).length;

    const downloadCSV = () => {
        const headers = ["Name", "Student Number", "Email", "Faculty", "Department", "Level", "Employment Type", "Job Opportunities", "Is Present"];
        const csvRows = [
            headers.join(","),
            ...filteredRegs.map(r => [
                `"${r.full_name?.replace(/"/g, '""') || ''}"`,
                `"${r.student_number?.replace(/"/g, '""') || ''}"`,
                `"${r.email?.replace(/"/g, '""') || ''}"`,
                `"${r.faculty?.replace(/"/g, '""') || ''}"`,
                `"${r.department?.replace(/"/g, '""') || ''}"`,
                `"${r.level?.replace(/"/g, '""') || ''}"`,
                `"${r.employment_type?.replace(/"/g, '""') || ''}"`,
                `"${r.job_opportunities?.replace(/"/g, '""') || ''}"`,
                r.is_present ? "Yes" : "No"
            ].join(","))
        ];

        const csvString = csvRows.join("\n");
        const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `Reception_Attendance_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleEditQueues = async (regId: string) => {
        if (editingRegId === regId) {
            setEditingRegId(null);
            return;
        }
        setEditingRegId(regId);
        setTicketsToRemove(new Set());
        setCompaniesToAdd(new Set());
        setSelectedAddCompany("");

        const { data } = await supabase
            .from("queue_tickets")
            .select("id, company_id, status")
            .eq("registration_id", regId)
            .in("status", ["pending", "called", "interviewing"]);

        setCandidateTickets(data || []);
    };

    const handleSaveQueues = async (regId: string) => {
        if (ticketsToRemove.size === 0 && companiesToAdd.size === 0) {
            setEditingRegId(null);
            return;
        }

        setSavingQueues(true);
        try {
            const res = await fetch("/api/reception/update-queues", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    registrationId: regId,
                    removeTicketIds: Array.from(ticketsToRemove),
                    addCompanyIds: Array.from(companiesToAdd)
                })
            });

            const result = await res.json();
            if (!res.ok) throw new Error(result.error || "Failed to update queues");

            setEditingRegId(null);
            alert("Queue updated successfully!");
        } catch (err: any) {
            alert(`Error updating queue: ${err.message}`);
        } finally {
            setSavingQueues(false);
        }
    };

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

                {/* Tab Switcher */}
                <div className="flex bg-[#131314] p-1.5 rounded-2xl border border-gray-800/60 mt-4 md:mt-8 mb-6">
                    <button
                        onClick={() => setActiveTab("attendance")}
                        className={`flex-1 py-3 text-sm font-bold uppercase tracking-widest rounded-xl transition-all ${activeTab === "attendance" ? "bg-blue-500 text-white shadow-md" : "text-gray-500 hover:text-gray-300 hover:bg-[#1E1F22]"}`}
                    >
                        Attendance Logs
                    </button>
                    <button
                        onClick={() => setActiveTab("queues")}
                        className={`flex-1 py-3 text-sm font-bold uppercase tracking-widest rounded-xl transition-all ${activeTab === "queues" ? "bg-blue-500 text-white shadow-md" : "text-gray-500 hover:text-gray-300 hover:bg-[#1E1F22]"}`}
                    >
                        Manage Queues
                    </button>
                </div>

                {/* Metrics (Only visible in Attendance Mode) */}
                {activeTab === "attendance" && (
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
                )}

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
                    {activeTab === "attendance" && (
                        <div className="flex gap-2">
                            {(["all", "present", "away"] as const).map(f => (
                                <button key={f} onClick={() => setFilterPresent(f)}
                                    className={`px-5 h-12 rounded-2xl text-xs font-bold uppercase tracking-widest transition-all
                                    ${filterPresent === f ? "bg-blue-500 text-white" : "bg-[#131314] border border-gray-800/60 text-gray-400 hover:bg-[#1A1B1E]"}`}
                                >
                                    {f}
                                </button>
                            ))}
                            <button onClick={downloadCSV} className="flex items-center gap-2 px-5 h-12 rounded-2xl text-[11px] font-bold uppercase tracking-widest transition-all bg-[#1E1F22] border border-gray-800 text-gray-300 hover:text-white hover:bg-[#25262B] group">
                                <Download className="w-4 h-4 group-hover:scale-110 transition-transform" /> <span className="hidden sm:inline">Export CSV</span>
                            </button>
                        </div>
                    )}
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
                                <div key={reg.id} className="group border-b border-gray-800/50 last:border-0">
                                    <div
                                        onClick={() => activeTab === "queues" && handleEditQueues(reg.id)}
                                        className={`p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-colors ${activeTab === "queues" ? "cursor-pointer hover:bg-[#1A1B1E]" : "hover:bg-[#1A1B1E]"}`}
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-3">
                                                <p className={`text-base font-medium truncate ${reg.is_present || activeTab === "queues" ? "text-gray-100" : "text-gray-400"}`}>
                                                    {reg.full_name}
                                                </p>
                                                {reg.is_present && (
                                                    <span className="px-2 py-0.5 rounded-md bg-green-500/20 text-green-400 text-[10px] font-bold uppercase tracking-widest border border-green-500/20">Present</span>
                                                )}
                                            </div>
                                            <p className="text-[13px] text-gray-500 mt-0.5 truncate">{reg.student_number} <span className="mx-1.5 opacity-40">|</span> {reg.level}</p>
                                        </div>

                                        {activeTab === "attendance" ? (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); toggleAttendance(reg); }}
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
                                        ) : (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleEditQueues(reg.id); }}
                                                className={`shrink-0 flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all shadow-sm ${editingRegId === reg.id ? "bg-blue-600 border border-blue-500 text-white" : "bg-[#1E1F22] hover:bg-blue-500 hover:text-white text-gray-400 border border-gray-800"}`}
                                            >
                                                {editingRegId === reg.id ? "Close Editor" : "Edit Queues"}
                                            </button>
                                        )}
                                    </div>

                                    {/* Queue Editor Modal/Expando */}
                                    {activeTab === "queues" && editingRegId === reg.id && (
                                        <div className="bg-[#1A1B1E] border-t border-gray-800/60 p-5 md:pl-[3.25rem] flex flex-col gap-6 animate-in slide-in-from-top-2">
                                            <div className="flex flex-col gap-3">
                                                <h3 className="text-xs uppercase tracking-widest font-bold text-gray-400 flex items-center gap-2">
                                                    Current Queue Assignments
                                                </h3>
                                                <div className="flex flex-col gap-2">
                                                    {candidateTickets.map(t => {
                                                        const isRemoved = ticketsToRemove.has(t.id);
                                                        const comp = companies.find(c => c.id === t.company_id);
                                                        return (
                                                            <div key={t.id} className={`flex items-center justify-between p-3.5 rounded-xl border transition-all ${isRemoved ? 'bg-red-500/5 border-red-500/20 opacity-60' : 'bg-[#131314] border-gray-800/60'}`}>
                                                                <div className="flex flex-col">
                                                                    <span className={`font-medium ${isRemoved ? 'text-red-400 line-through' : 'text-gray-200'}`}>{comp?.name || "Unknown Company"}</span>
                                                                    <span className={`text-[10px] uppercase font-bold mt-0.5 ${isRemoved ? 'text-red-500/50' : 'text-gray-500'}`}>{t.status}</span>
                                                                </div>
                                                                <button
                                                                    onClick={() => {
                                                                        const newRemovals = new Set(ticketsToRemove);
                                                                        if (isRemoved) newRemovals.delete(t.id);
                                                                        else newRemovals.add(t.id);
                                                                        setTicketsToRemove(newRemovals);
                                                                    }}
                                                                    className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors ${isRemoved ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20'}`}
                                                                >
                                                                    {isRemoved ? "Keep Queue" : "Remove"}
                                                                </button>
                                                            </div>
                                                        );
                                                    })}
                                                    {candidateTickets.length === 0 && (
                                                        <div className="px-4 py-6 text-center border border-dashed border-gray-800/80 rounded-xl bg-[#131314]/50">
                                                            <p className="text-sm text-gray-500 font-medium">No active queues found for this candidate.</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex flex-col gap-3">
                                                <h3 className="text-xs uppercase tracking-widest font-bold text-gray-400">Add to New Queue</h3>
                                                <div className="flex flex-col sm:flex-row gap-3">
                                                    <select
                                                        value={selectedAddCompany}
                                                        onChange={(e) => setSelectedAddCompany(e.target.value)}
                                                        className="flex-1 bg-[#131314] border border-gray-800/60 rounded-xl h-12 px-4 text-sm font-medium text-gray-200 focus:ring-2 focus:ring-blue-500/50 outline-none"
                                                    >
                                                        <option value="">Choose a company to join...</option>
                                                        {companies.map(c => {
                                                            const isAlreadyWaiting = candidateTickets.some(t => t.company_id === c.id);
                                                            const isPendedToAdd = companiesToAdd.has(c.id);
                                                            if (isAlreadyWaiting) return null;
                                                            return (
                                                                <option key={c.id} value={c.id} disabled={isPendedToAdd} className="bg-[#131314] text-gray-200">
                                                                    {c.name} {isPendedToAdd ? "(Queued to Add)" : ""} {c.room_number ? `— ${c.room_number}` : ""}
                                                                </option>
                                                            );
                                                        })}
                                                    </select>
                                                    <button
                                                        onClick={() => {
                                                            if (!selectedAddCompany) return;
                                                            setCompaniesToAdd(new Set(companiesToAdd).add(selectedAddCompany));
                                                            setSelectedAddCompany("");
                                                        }}
                                                        disabled={!selectedAddCompany}
                                                        className="px-6 h-12 rounded-xl bg-[#1E1F22] hover:bg-blue-500 hover:text-white text-gray-300 border border-gray-800 text-xs font-bold uppercase tracking-widest transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                                                    >
                                                        Add Company
                                                    </button>
                                                </div>

                                                {companiesToAdd.size > 0 && (
                                                    <div className="flex flex-wrap gap-2 mt-2">
                                                        {Array.from(companiesToAdd).map(cid => {
                                                            const cName = companies.find(c => c.id === cid)?.name;
                                                            return (
                                                                <div key={cid} className="bg-blue-500/10 border border-blue-500/30 text-blue-400 px-3.5 py-1.5 rounded-full text-xs font-medium flex items-center gap-2 shadow-sm">
                                                                    <span>+ {cName}</span>
                                                                    <button onClick={() => {
                                                                        const s = new Set(companiesToAdd);
                                                                        s.delete(cid);
                                                                        setCompaniesToAdd(s);
                                                                    }} className="hover:bg-blue-500/20 w-5 h-5 flex items-center justify-center rounded-full transition-colors ml-1 font-bold">&times;</button>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex justify-end pt-5 mt-2 border-t border-gray-800/60">
                                                <button
                                                    onClick={() => handleSaveQueues(reg.id)}
                                                    disabled={savingQueues || (ticketsToRemove.size === 0 && companiesToAdd.size === 0)}
                                                    className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(37,99,235,0.2)] w-full sm:w-auto"
                                                >
                                                    {savingQueues ? "Saving Changes..." : "Save Queue Updates"}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
