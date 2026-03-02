"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";

interface Stats {
    registrations: number;
    companies: number;
    users: number;
    queue_pending: number;
    queue_interviewing: number;
}

export default function AdminOverview() {
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);
    const supabase = createClient();

    useEffect(() => {
        const fetchStats = async () => {
            const [
                { count: registrations },
                { count: companies },
                { count: users },
                { count: queue_pending },
                { count: queue_interviewing },
            ] = await Promise.all([
                supabase.from("registrations").select("*", { count: "exact", head: true }),
                supabase.from("companies").select("*", { count: "exact", head: true }),
                supabase.from("profiles").select("*", { count: "exact", head: true }),
                supabase.from("queue_tickets").select("*", { count: "exact", head: true }).eq("status", "pending"),
                supabase.from("queue_tickets").select("*", { count: "exact", head: true }).eq("status", "interviewing"),
            ]);
            setStats({
                registrations: registrations || 0,
                companies: companies || 0,
                users: users || 0,
                queue_pending: queue_pending || 0,
                queue_interviewing: queue_interviewing || 0,
            });
            setLoading(false);
        };
        fetchStats();
    }, []);

    const statCards = [
        {
            label: "Total Registrations",
            value: stats?.registrations,
            icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
            color: "from-indigo-500 to-indigo-600",
            glow: "shadow-indigo-500/20"
        },
        {
            label: "Companies / Rooms",
            value: stats?.companies,
            icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4",
            color: "from-violet-500 to-violet-600",
            glow: "shadow-violet-500/20"
        },
        {
            label: "In Queue (Pending)",
            value: stats?.queue_pending,
            icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
            color: "from-amber-500 to-orange-500",
            glow: "shadow-amber-500/20"
        },
        {
            label: "Active Interviews",
            value: stats?.queue_interviewing,
            icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
            color: "from-emerald-500 to-green-600",
            glow: "shadow-emerald-500/20"
        },
    ];

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-black text-white tracking-tight">Dashboard Overview</h1>
                <p className="text-slate-400 mt-1">Career Fair Management System</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {statCards.map((card) => (
                    <div key={card.label} className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6 shadow-lg">
                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center shadow-lg ${card.glow} mb-4`}>
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={card.icon} />
                            </svg>
                        </div>
                        <div className="text-3xl font-black text-white mb-1">
                            {loading ? <span className="inline-block w-12 h-8 bg-slate-700 rounded animate-pulse" /> : card.value}
                        </div>
                        <div className="text-slate-400 text-sm font-medium">{card.label}</div>
                    </div>
                ))}
            </div>

            {/* Quick actions */}
            <div>
                <h2 className="text-lg font-bold text-white mb-4">Quick Actions</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[
                        { href: "/admin/import", label: "Upload CSV Data", desc: "Import registrations from spreadsheet", icon: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12", color: "text-indigo-400" },
                        { href: "/admin/companies", label: "Manage Companies", desc: "Add or edit interview rooms", icon: "M12 6v6m0 0v6m0-6h6m-6 0H6", color: "text-violet-400" },
                        { href: "/admin/users", label: "Manage Users", desc: "Add room leads and admins", icon: "M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z", color: "text-emerald-400" },
                        { href: "/admin/queue", label: "Monitor Queue", desc: "Real-time queue status", icon: "M4 6h16M4 10h16M4 14h16M4 18h16", color: "text-amber-400" },
                        { href: "/admin/registrations", label: "View Registrations", desc: "Browse all registered candidates", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2", color: "text-blue-400" },
                        { href: "/board", label: "Display Board ↗", desc: "Public screen for candidates", icon: "M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h16a2 2 0 012 2v10a2 2 0 01-2 2h-2", color: "text-pink-400" },
                    ].map(item => (
                        <a key={item.href} href={item.href} className="group bg-slate-900 border border-slate-700/50 hover:border-slate-600 rounded-2xl p-5 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5">
                            <svg className={`w-6 h-6 ${item.color} mb-3`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                            </svg>
                            <p className="text-white font-semibold text-sm">{item.label}</p>
                            <p className="text-slate-500 text-xs mt-0.5">{item.desc}</p>
                        </a>
                    ))}
                </div>
            </div>
        </div>
    );
}
