"use client";
import { useState, useRef } from "react";

interface ParsedRow {
    timestamp: string;
    full_name: string;
    university: string;
    student_number: string;
    email: string;
    contact_number: string;
    faculty: string;
    level: string;
    department: string;
    employment_type: string;
    companies_march3: string;
    companies_march4: string;
    job_opportunities: string;
    cv_link: string;
}

function parseCSV(text: string): ParsedRow[] {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];

    // Parse header line (handle quoted fields)
    const parseRow = (line: string): string[] => {
        const result: string[] = [];
        let inQuotes = false;
        let current = "";
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
                else inQuotes = !inQuotes;
            } else if (ch === "," && !inQuotes) {
                result.push(current.trim());
                current = "";
            } else {
                current += ch;
            }
        }
        result.push(current.trim());
        return result;
    };

    // Map header to column indices
    const headers = parseRow(lines[0]).map(h => h.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_"));

    const find = (...candidates: string[]) => {
        for (const c of candidates) {
            const idx = headers.findIndex(h => h.includes(c.replace(/[^a-z0-9]+/g, "_").toLowerCase()));
            if (idx >= 0) return idx;
        }
        return -1;
    };

    const colMap = {
        timestamp: find("timestamp"),
        full_name: find("full_name", "name"),
        university: find("university"),
        student_number: find("student_number", "student_no", "student_id"),
        email: find("email_address", "email"),
        contact_number: find("contact_number", "whatsapp", "contact"),
        faculty: find("faculty"),
        level: find("level"),
        department: find("department"),
        employment_type: find("employment_type", "employment"),
        companies_march3: find("march_3", "3rd_of_march", "3_of_march", "march3"),
        companies_march4: find("march_4", "4th_of_march", "4_of_march", "march4"),
        job_opportunities: find("job_opportunities", "job"),
        cv_link: find("cv"),
    };

    return lines.slice(1).map(line => {
        const vals = parseRow(line);
        const get = (idx: number) => (idx >= 0 ? vals[idx] || "" : "");
        return {
            timestamp: get(colMap.timestamp),
            full_name: get(colMap.full_name),
            university: get(colMap.university),
            student_number: get(colMap.student_number),
            email: get(colMap.email) || get(find("email_address_2", "email_2")),
            contact_number: get(colMap.contact_number),
            faculty: get(colMap.faculty),
            level: get(colMap.level),
            department: get(colMap.department),
            employment_type: get(colMap.employment_type),
            companies_march3: get(colMap.companies_march3),
            companies_march4: get(colMap.companies_march4),
            job_opportunities: get(colMap.job_opportunities),
            cv_link: get(colMap.cv_link),
        };
    }).filter(r => r.full_name.trim());
}

export default function ImportPage() {
    const [rows, setRows] = useState<ParsedRow[]>([]);
    const [fileName, setFileName] = useState("");
    const [importing, setImporting] = useState(false);
    const [result, setResult] = useState<{ success: number; errors: number; companiesCreated: number } | null>(null);
    const [step, setStep] = useState<"upload" | "preview" | "done">("upload");
    const fileRef = useRef<HTMLInputElement>(null);

    const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setFileName(file.name);
        setResult(null);

        const reader = new FileReader();
        reader.onload = ev => {
            const text = ev.target?.result as string;
            const parsed = parseCSV(text);
            setRows(parsed);
            setStep("preview");
        };
        reader.readAsText(file);
    };

    const handleImport = async () => {
        setImporting(true);
        const res = await fetch("/api/admin/import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rows }),
        });
        const data = await res.json();
        setResult(data);
        setImporting(false);
        setStep("done");
    };

    const reset = () => {
        setRows([]);
        setFileName("");
        setResult(null);
        setStep("upload");
        if (fileRef.current) fileRef.current.value = "";
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-black text-white">CSV Import</h1>
                <p className="text-slate-400 mt-1">Upload your Google Form registration export to populate the database</p>
            </div>

            {/* Steps indicator */}
            <div className="flex items-center gap-3">
                {["upload", "preview", "done"].map((s, i) => (
                    <div key={s} className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${step === s ? "bg-indigo-600 text-white" : (["upload", "preview", "done"].indexOf(step) > i ? "bg-emerald-600 text-white" : "bg-slate-700 text-slate-400")}`}>
                            {["upload", "preview", "done"].indexOf(step) > i ? "✓" : i + 1}
                        </div>
                        <span className={`text-sm font-medium capitalize hidden sm:inline ${step === s ? "text-white" : "text-slate-500"}`}>{s}</span>
                        {i < 2 && <div className="w-8 h-px bg-slate-700 hidden sm:block" />}
                    </div>
                ))}
            </div>

            {/* Upload step */}
            {step === "upload" && (
                <div
                    className="border-2 border-dashed border-slate-600 hover:border-indigo-500 rounded-2xl p-12 text-center cursor-pointer transition-all group"
                    onClick={() => fileRef.current?.click()}
                >
                    <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
                    <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center mx-auto mb-4 group-hover:bg-indigo-500/20 transition-all">
                        <svg className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                    </div>
                    <p className="text-white font-bold text-lg mb-1">Drop your CSV file here</p>
                    <p className="text-slate-400 text-sm">or click to browse</p>
                    <p className="text-slate-600 text-xs mt-4">Supports Google Forms CSV export with the registration columns</p>
                </div>
            )}

            {/* Preview step */}
            {step === "preview" && rows.length > 0 && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-white font-bold">{fileName}</p>
                            <p className="text-slate-400 text-sm">{rows.length} valid rows found</p>
                        </div>
                        <button onClick={reset} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm transition-all">← Choose different file</button>
                    </div>

                    {/* Preview table */}
                    <div className="bg-slate-900 border border-slate-700/50 rounded-2xl overflow-hidden">
                        <div className="overflow-x-auto max-h-96">
                            <table className="w-full text-xs">
                                <thead className="sticky top-0 bg-slate-800">
                                    <tr className="border-b border-slate-700">
                                        {["#", "Full Name", "University", "Student #", "Email", "Faculty", "Level", "Mar 3", "Mar 4"].map(h => (
                                            <th key={h} className="text-left px-3 py-2.5 text-slate-400 font-semibold whitespace-nowrap">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.slice(0, 50).map((r, i) => (
                                        <tr key={i} className="border-b border-slate-700/30 hover:bg-slate-800/50">
                                            <td className="px-3 py-2 text-slate-500">{i + 1}</td>
                                            <td className="px-3 py-2 text-white font-medium whitespace-nowrap">{r.full_name}</td>
                                            <td className="px-3 py-2 text-slate-300 max-w-[120px] truncate">{r.university}</td>
                                            <td className="px-3 py-2 text-slate-300">{r.student_number}</td>
                                            <td className="px-3 py-2 text-slate-300 max-w-[140px] truncate">{r.email}</td>
                                            <td className="px-3 py-2 text-slate-300 max-w-[100px] truncate">{r.faculty}</td>
                                            <td className="px-3 py-2"><span className="px-1.5 py-0.5 bg-indigo-500/20 text-indigo-300 rounded text-xs">{r.level}</span></td>
                                            <td className="px-3 py-2 text-slate-300 max-w-[150px] truncate">{r.companies_march3}</td>
                                            <td className="px-3 py-2 text-slate-300 max-w-[150px] truncate">{r.companies_march4}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {rows.length > 50 && (
                            <div className="px-4 py-2 text-slate-500 text-xs border-t border-slate-700/50">
                                Showing first 50 of {rows.length} rows. All rows will be imported.
                            </div>
                        )}
                    </div>

                    <div className="flex gap-3">
                        <button onClick={reset} className="px-5 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-semibold text-sm transition-all">Cancel</button>
                        <button
                            onClick={handleImport}
                            disabled={importing}
                            className="flex-1 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-500/20 disabled:opacity-60 transition-all"
                        >
                            {importing ? (
                                <span className="flex items-center justify-center gap-2">
                                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                    </svg>
                                    Importing {rows.length} rows...
                                </span>
                            ) : `Import ${rows.length} Registrations →`}
                        </button>
                    </div>
                </div>
            )}

            {/* Done step */}
            {step === "done" && result && (
                <div className="space-y-4">
                    <div className={`rounded-2xl p-8 text-center border ${result.errors === 0 ? "bg-emerald-500/10 border-emerald-500/30" : "bg-amber-500/10 border-amber-500/30"}`}>
                        <div className={`text-5xl font-black mb-2 ${result.errors === 0 ? "text-emerald-400" : "text-amber-400"}`}>
                            {result.errors === 0 ? "✓" : "⚠"}
                        </div>
                        <h2 className="text-white text-xl font-bold mb-2">Import Complete</h2>
                        <div className="flex justify-center gap-6 text-sm">
                            <div className="text-center">
                                <div className="text-2xl font-black text-emerald-400">{result.success}</div>
                                <div className="text-slate-400">Registrations</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-black text-indigo-400">{result.companiesCreated}</div>
                                <div className="text-slate-400">Companies Added</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-black text-red-400">{result.errors}</div>
                                <div className="text-slate-400">Errors</div>
                            </div>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <button onClick={reset} className="px-5 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-semibold text-sm transition-all">Import Another File</button>
                        <a href="/admin/registrations" className="flex-1 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-sm text-center transition-all">View Registrations →</a>
                    </div>
                </div>
            )}

            {/* Column mapping guide */}
            <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-5">
                <h3 className="text-white font-bold text-sm mb-3">Expected CSV Columns</h3>
                <div className="flex flex-wrap gap-2">
                    {["Timestamp", "Full Name", "University", "Student Number", "Email Address", "Contact Number (WhatsApp)", "Faculty", "Level", "Department", "Employment Type", "What companies would you like to go for interviews on 3rd of March?", "What companies would you like to go for interviews in 4th of March?", "Which are the job opportunities that you would like to apply?", "CV", "Email address"].map(c => (
                        <span key={c} className="px-2 py-1 bg-slate-800 text-slate-300 text-xs rounded-lg font-mono">{c}</span>
                    ))}
                </div>
            </div>
        </div>
    );
}
