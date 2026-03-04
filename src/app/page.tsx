"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";

interface Company { id: string; name: string; room_number: string; interview_date: string }
interface JobOpp { id: string; title: string; company: string }

const FACULTIES = ["Faculty of Computing", "Faculty of Engineering", "Faculty of Business", "Faculty of Science", "Faculty of Arts & Culture", "Faculty of Health Sciences", "Other"];
const LEVELS = ["Year 1", "Year 2", "Year 3", "Year 4", "Postgraduate", "Other"];
const EMP_TYPES = ["Full-time", "Part-time", "Internship", "Contract", "Freelance"];

export default function RegistrationPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedForm, setSubmittedForm] = useState<typeof form | null>(null);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  const [form, setForm] = useState({
    full_name: "",
    university: "",
    student_number: "",
    email: "",
    contact_number: "",
    faculty: "",
    level: "",
    department: "",
    employment_type: "",
    companies_march3: [] as string[],
    companies_march4: [] as string[],
    job_opportunities: "",
    cv_link: "",
  });

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase.from("companies").select("*").order("interview_date").order("name");
      setCompanies(data || []);
      setLoading(false);
    };
    fetch();
  }, []);

  const march3Companies = companies.filter(c => c.interview_date === "2026-03-03");
  const march4Companies = companies.filter(c => c.interview_date === "2026-03-04");

  const toggleCompany = (arr: string[], id: string) =>
    arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id];

  const set = (key: string, value: unknown) => setForm(f => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.companies_march3.length === 0 && form.companies_march4.length === 0) {
      setError("Please select at least one company for either day.");
      return;
    }
    setSubmitting(true);
    setError(null);

    const allCompanyIds = [...form.companies_march3, ...form.companies_march4];

    const insertData = {
      full_name: form.full_name,
      university: form.university,
      student_number: form.student_number,
      email: form.email,
      contact_number: form.contact_number,
      faculty: form.faculty,
      level: form.level,
      department: form.department,
      employment_type: form.employment_type,
      companies_march3: form.companies_march3.map(id => companies.find(c => c.id === id)?.name).join(", "),
      companies_march4: form.companies_march4.map(id => companies.find(c => c.id === id)?.name).join(", "),
      job_opportunities: form.job_opportunities,
      cv_link: form.cv_link,
      allCompanyIds: allCompanyIds,
    };

    try {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(insertData),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Failed to register");
      }
    } catch (err: any) {
      setError(err.message || "Network error occurred.");
      setSubmitting(false);
      return;
    }

    setSubmittedForm({ ...form });
    setSubmitting(false);
    setSubmitted(true);
  };

  if (submitted && submittedForm) {
    const todayStr = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric" });
    const todayDate = new Date().toISOString().split("T")[0];
    const isMarch3 = todayDate === "2026-03-03";
    const isMarch4 = todayDate === "2026-03-04";
    const todayCompanyIds = isMarch3 ? submittedForm.companies_march3 : isMarch4 ? submittedForm.companies_march4 : [];
    const tomorrowCompanyIds = isMarch3 ? submittedForm.companies_march4 : [];
    const todayCompanyNames = todayCompanyIds.map(id => companies.find(c => c.id === id)?.name).filter(Boolean);
    const tomorrowCompanyNames = tomorrowCompanyIds.map(id => companies.find(c => c.id === id)?.name).filter(Boolean);

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex items-center justify-center p-4">
        <div className="text-center max-w-md w-full">
          <div className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-500/40 flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-3xl font-black text-white mb-1">You&apos;re Registered!</h1>
          <p className="text-slate-400 mb-6 text-sm">Welcome, <span className="text-white font-semibold">{submittedForm.full_name}</span></p>

          {/* Attendance badge */}
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl px-5 py-4 mb-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div className="text-left">
              <p className="text-emerald-400 font-bold text-sm">Attendance Marked ✓</p>
              <p className="text-slate-400 text-xs">You are marked as present for {todayStr}</p>
            </div>
          </div>

          {/* Today's queue */}
          {todayCompanyNames.length > 0 && (
            <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-2xl px-5 py-4 mb-4 text-left">
              <p className="text-indigo-400 font-bold text-sm mb-2">✓ Added to Today&apos;s Queue</p>
              <ul className="space-y-1">
                {todayCompanyNames.map((name, i) => (
                  <li key={i} className="text-white text-sm font-medium flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                    {name}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Tomorrow's companies */}
          {tomorrowCompanyNames.length > 0 && (
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl px-5 py-4 mb-6 text-left">
              <p className="text-slate-400 font-bold text-sm mb-2">⏳ March 4 — Queue on Arrival</p>
              <ul className="space-y-1">
                {tomorrowCompanyNames.map((name, i) => (
                  <li key={i} className="text-slate-400 text-sm flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-500 shrink-0" />
                    {name}
                  </li>
                ))}
              </ul>
              <p className="text-slate-500 text-xs mt-2">You will be queued automatically when you arrive tomorrow.</p>
            </div>
          )}

          <div className="flex gap-3 justify-center">
            <a href="/display" className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold text-sm transition-all">View Display Board</a>
            <button onClick={() => { setSubmitted(false); setSubmittedForm(null); }} className="px-5 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl font-semibold text-sm transition-all">Register Another</button>
          </div>
        </div>
      </div>
    );
  }



  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 py-10 px-4">
      {/* Background orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-violet-600/10 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-2xl shadow-indigo-500/30 mb-4">
            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-4xl font-black text-white">Career Fair 2026</h1>
          <p className="text-slate-400 mt-2">Register for interviews with your preferred companies</p>
          <div className="flex items-center justify-center gap-4 mt-4">
            <span className="px-3 py-1.5 bg-indigo-500/20 text-indigo-300 text-sm rounded-full font-semibold">March 3 & 4, 2026</span>
          </div>
        </div>

        {loading ? (
          <div className="text-center text-slate-400 py-20">Loading companies...</div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Personal Info */}
            <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6 shadow-xl space-y-4">
              <h2 className="text-lg font-bold text-white border-b border-slate-700/50 pb-3">Personal Information</h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Full Name *</label>
                  <input required value={form.full_name} onChange={e => set("full_name", e.target.value)}
                    placeholder="As per student ID" className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Student Number *</label>
                  <input required value={form.student_number} onChange={e => set("student_number", e.target.value)}
                    placeholder="e.g. CB012345" className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Email Address *</label>
                  <input required type="email" value={form.email} onChange={e => set("email", e.target.value)}
                    placeholder="student@university.edu" className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">WhatsApp Number *</label>
                  <input required value={form.contact_number} onChange={e => set("contact_number", e.target.value)}
                    placeholder="+94 7X XXX XXXX" className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">University *</label>
                <input required value={form.university} onChange={e => set("university", e.target.value)}
                  placeholder="Your university name" className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
              </div>
            </div>

            {/* Academic Info */}
            <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6 shadow-xl space-y-4">
              <h2 className="text-lg font-bold text-white border-b border-slate-700/50 pb-3">Academic Details</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Faculty *</label>
                  <select required value={form.faculty} onChange={e => set("faculty", e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm">
                    <option value="">Select faculty</option>
                    {FACULTIES.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Level / Year *</label>
                  <select required value={form.level} onChange={e => set("level", e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm">
                    <option value="">Select year</option>
                    {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Department</label>
                  <input value={form.department} onChange={e => set("department", e.target.value)}
                    placeholder="e.g. Software Engineering" className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
                </div>
              </div>
            </div>

            {/* Employment & CV */}
            <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6 shadow-xl space-y-4">
              <h2 className="text-lg font-bold text-white border-b border-slate-700/50 pb-3">Career Preferences</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Employment Type *</label>
                  <select required value={form.employment_type} onChange={e => set("employment_type", e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm">
                    <option value="">Select type</option>
                    {EMP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">CV Link</label>
                  <input value={form.cv_link} onChange={e => set("cv_link", e.target.value)}
                    placeholder="Google Drive / LinkedIn URL" className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Job Opportunities Seeking</label>
                  <input value={form.job_opportunities} onChange={e => set("job_opportunities", e.target.value)}
                    placeholder="e.g. Software Engineer, Data Analyst, UI/UX Designer" className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
                </div>
              </div>
            </div>

            {/* Company selections */}
            {march3Companies.length > 0 && (
              <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6 shadow-xl">
                <h2 className="text-lg font-bold text-white border-b border-slate-700/50 pb-3 mb-4">
                  March 3 Interviews
                  {form.companies_march3.length > 0 && <span className="ml-2 text-sm text-indigo-400 font-normal">({form.companies_march3.length} selected)</span>}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {march3Companies.map(c => {
                    const selected = form.companies_march3.includes(c.id);
                    return (
                      <label key={c.id} className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition-all ${selected ? "bg-indigo-500/10 border-indigo-500/50" : "border-slate-700/50 hover:border-slate-600 hover:bg-slate-800/50"}`}>
                        <input type="checkbox" checked={selected} onChange={() => set("companies_march3", toggleCompany(form.companies_march3, c.id))} className="w-4 h-4 accent-indigo-500" />
                        <div>
                          <p className="text-white text-sm font-semibold">{c.name}</p>
                          <p className="text-slate-400 text-xs">{c.room_number}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {march4Companies.length > 0 && (
              <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6 shadow-xl">
                <h2 className="text-lg font-bold text-white border-b border-slate-700/50 pb-3 mb-4">
                  March 4 Interviews
                  {form.companies_march4.length > 0 && <span className="ml-2 text-sm text-violet-400 font-normal">({form.companies_march4.length} selected)</span>}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {march4Companies.map(c => {
                    const selected = form.companies_march4.includes(c.id);
                    return (
                      <label key={c.id} className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition-all ${selected ? "bg-violet-500/10 border-violet-500/50" : "border-slate-700/50 hover:border-slate-600 hover:bg-slate-800/50"}`}>
                        <input type="checkbox" checked={selected} onChange={() => set("companies_march4", toggleCompany(form.companies_march4, c.id))} className="w-4 h-4 accent-violet-500" />
                        <div>
                          <p className="text-white text-sm font-semibold">{c.name}</p>
                          <p className="text-slate-400 text-xs">{c.room_number}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl text-sm">{error}</div>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-4 px-6 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-black text-lg rounded-2xl shadow-2xl shadow-indigo-500/25 disabled:opacity-60 transition-all duration-200"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Submitting...
                </span>
              ) : "Complete Registration →"}
            </button>

            <div className="text-center">
              <a href="/login" className="text-slate-500 hover:text-slate-400 text-sm transition-colors">Staff Login →</a>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
