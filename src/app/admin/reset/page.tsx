"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase";

type ResetResult = { reset: number } | null;

export default function ResetPage() {
    const [step, setStep] = useState<"idle" | "confirm1" | "confirm2" | "done">("idle");
    const [typeInput, setTypeInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<ResetResult>(null);
    const [scope, setScope] = useState<"active" | "all">("active");
    const supabase = createClient();

    const handleReset = async () => {
        setLoading(true);
        const statuses = scope === "active"
            ? ["pending", "called", "interviewing"]
            : ["pending", "called", "interviewing", "completed", "skipped"];

        const { data, error } = await supabase
            .from("queue_tickets")
            .delete()
            .in("status", statuses)
            .select();

        if (error) {
            console.error(error);
            setLoading(false);
            return;
        }
        setResult({ reset: data?.length || 0 });
        setLoading(false);
        setStep("done");
        setTypeInput("");
    };

    return (
        <div className="space-y-6 max-w-xl">
            <div>
                <h1 className="text-3xl font-black text-white">Queue Reset</h1>
                <p className="text-slate-400 mt-1">Wipe queue tickets for testing or between sessions.</p>
            </div>

            <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 space-y-5">
                <div className="flex items-start gap-3">
                    <span className="text-red-400 text-2xl">⚠</span>
                    <div>
                        <p className="text-red-300 font-bold">Danger Zone</p>
                        <p className="text-slate-400 text-sm mt-1">This action is irreversible. Queue tickets will be permanently deleted. Registration records are preserved.</p>
                    </div>
                </div>

                {/* Scope selector */}
                <div>
                    <label className="block text-sm font-semibold text-slate-300 mb-2">Reset Scope</label>
                    <div className="flex gap-3">
                        {([["active", "Active only (pending/called/interviewing)"], ["all", "Everything (including completed/skipped)"]] as const).map(([val, label]) => (
                            <label key={val} className={`flex-1 flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${scope === val ? "border-red-500/50 bg-red-500/10" : "border-slate-700 hover:border-slate-600"}`}>
                                <input type="radio" name="scope" value={val} checked={scope === val} onChange={() => setScope(val)} className="accent-red-500" />
                                <span className="text-sm text-slate-300">{label}</span>
                            </label>
                        ))}
                    </div>
                </div>

                {step === "idle" && (
                    <button onClick={() => setStep("confirm1")}
                        className="w-full py-3 bg-red-600/20 hover:bg-red-600/30 border border-red-500/40 text-red-300 font-bold rounded-xl transition-all">
                        Reset Queue Tickets
                    </button>
                )}

                {step === "confirm1" && (
                    <div className="space-y-3">
                        <p className="text-white font-semibold">Are you absolutely sure?</p>
                        <p className="text-slate-400 text-sm">This will delete all <span className="text-amber-400 font-bold">{scope === "active" ? "active" : "all"}</span> queue tickets.</p>
                        <div className="flex gap-3">
                            <button onClick={() => setStep("idle")} className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-semibold text-sm transition-all">Cancel</button>
                            <button onClick={() => setStep("confirm2")} className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold text-sm transition-all">Yes, continue</button>
                        </div>
                    </div>
                )}

                {step === "confirm2" && (
                    <div className="space-y-3">
                        <p className="text-white font-semibold">Final confirmation — type <span className="font-mono bg-slate-800 px-1 rounded text-red-400">RESET</span> to confirm</p>
                        <input
                            value={typeInput}
                            onChange={e => setTypeInput(e.target.value.toUpperCase())}
                            placeholder="Type RESET"
                            className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-white font-mono focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
                        />
                        <div className="flex gap-3">
                            <button onClick={() => { setStep("idle"); setTypeInput(""); }} className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-semibold text-sm transition-all">Cancel</button>
                            <button
                                onClick={handleReset}
                                disabled={typeInput !== "RESET" || loading}
                                className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-xl font-bold text-sm transition-all"
                            >
                                {loading ? "Deleting..." : "🗑 Confirm Reset"}
                            </button>
                        </div>
                    </div>
                )}

                {step === "done" && result && (
                    <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-5 text-center">
                        <div className="text-4xl font-black text-emerald-400 mb-1">{result.reset}</div>
                        <p className="text-white font-bold">Queue tickets deleted</p>
                        <p className="text-slate-400 text-sm mt-1">Registration records are untouched.</p>
                        <button onClick={() => { setStep("idle"); setResult(null); }} className="mt-4 px-5 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-semibold text-sm transition-all">
                            Reset Again
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
