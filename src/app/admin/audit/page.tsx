"use client";
import { useState } from "react";

const DATES = [
    { label: "All Days", value: "" },
    { label: "March 3, 2026", value: "2026-03-03" },
    { label: "March 4, 2026", value: "2026-03-04" },
];

export default function AuditPage() {
    const [selectedDate, setSelectedDate] = useState("");
    const [downloading, setDownloading] = useState(false);
    const [done, setDone] = useState(false);

    const downloadAudit = async () => {
        setDownloading(true);
        setDone(false);
        try {
            const url = `/api/admin/audit${selectedDate ? `?date=${selectedDate}` : ""}`;
            const res = await fetch(url);
            if (!res.ok) {
                const j = await res.json();
                throw new Error(j.error || "Download failed");
            }
            const blob = await res.blob();
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            const dateLabel = selectedDate || "all-days";
            a.download = `career_fair_audit_${dateLabel}.csv`;
            a.click();
            URL.revokeObjectURL(a.href);
            setDone(true);
        } catch (err: any) {
            alert(`Error: ${err.message}`);
        } finally {
            setDownloading(false);
        }
    };

    return (
        <div className="space-y-8 max-w-2xl">
            <div>
                <h1 className="text-3xl font-black text-white tracking-tight">Audit Export</h1>
                <p className="text-slate-400 mt-1">Download a complete log of all registrations, queue tickets, and interview timings.</p>
            </div>

            {/* Export card */}
            <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6 space-y-6">

                {/* What's included */}
                <div>
                    <h2 className="text-sm font-bold text-slate-300 uppercase tracking-widest mb-3">What&apos;s Included</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {[
                            { icon: "👤", title: "Registrant Details", desc: "Name, student ID, email, contact, faculty, level, employment type" },
                            { icon: "🏢", title: "Company Visit Log", desc: "Which company, room, queue position, status (pending / called / interviewing / done)" },
                            { icon: "⏱", title: "Interview Timing", desc: "Started at, ended at, duration in minutes per company visit" },
                        ].map(item => (
                            <div key={item.title} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                                <div className="text-2xl mb-2">{item.icon}</div>
                                <p className="text-white font-semibold text-sm">{item.title}</p>
                                <p className="text-slate-400 text-xs mt-1">{item.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Date selector */}
                <div>
                    <h2 className="text-sm font-bold text-slate-300 uppercase tracking-widest mb-3">Select Date</h2>
                    <div className="flex flex-wrap gap-2">
                        {DATES.map(d => (
                            <button
                                key={d.value}
                                onClick={() => setSelectedDate(d.value)}
                                className={`px-5 py-2.5 rounded-xl text-sm font-bold border transition-all ${selectedDate === d.value
                                    ? "bg-indigo-500 border-indigo-500 text-white shadow-lg shadow-indigo-500/20"
                                    : "bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white"
                                    }`}
                            >
                                {d.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Download button */}
                <button
                    onClick={downloadAudit}
                    disabled={downloading}
                    className="w-full py-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-60 text-white font-black text-base rounded-xl transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-3"
                >
                    {downloading ? (
                        <>
                            <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                            </svg>
                            Generating CSV...
                        </>
                    ) : (
                        <>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            Download Complete Audit ({DATES.find(d => d.value === selectedDate)?.label})
                        </>
                    )}
                </button>

                {done && (
                    <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-5 py-3 text-center">
                        <p className="text-emerald-400 font-bold text-sm">✓ CSV downloaded successfully!</p>
                        <p className="text-slate-400 text-xs mt-0.5">Check your downloads folder.</p>
                    </div>
                )}
            </div>

            {/* Column reference */}
            <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6">
                <h2 className="text-sm font-bold text-slate-300 uppercase tracking-widest mb-4">CSV Column Reference</h2>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-slate-400 text-xs uppercase text-left border-b border-slate-700">
                                <th className="pb-2 pr-4 font-semibold">Column</th>
                                <th className="pb-2 font-semibold">Description</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                            {[
                                ["Full Name", "Candidate full name"],
                                ["Student Number", "University student ID"],
                                ["Email / Contact", "Contact details"],
                                ["Faculty / Department / Level", "Academic info"],
                                ["Employment Type / Job Opportunities", "Career preferences"],
                                ["Registered At", "When they registered (IST)"],
                                ["Is Present", "Whether they were marked present"],
                                ["Company", "Company name for this visit"],
                                ["Room Number", "Assigned interview room"],
                                ["Interview Date", "Date of interview (March 3 or 4)"],
                                ["Queue Status", "pending / called / interviewing / completed / skipped"],
                                ["Queue Position", "Their position in the queue"],
                                ["Queued At", "When their ticket was created"],
                                ["Interview Started At", "When room lead clicked Begin Interview"],
                                ["Interview Ended At", "When status changed to completed/skipped"],
                                ["Interview Duration (mins)", "Total time in the interview room"],
                            ].map(([col, desc]) => (
                                <tr key={col}>
                                    <td className="py-2 pr-4 text-white font-mono text-xs whitespace-nowrap">{col}</td>
                                    <td className="py-2 text-slate-400 text-xs">{desc}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
