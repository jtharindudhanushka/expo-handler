import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { NextRequest, NextResponse } from "next/server";

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function GET(req: NextRequest) {
    try {
        // Auth
        const supabase = await createServerSupabaseClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
        if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

        const { searchParams } = new URL(req.url);
        const date = searchParams.get("date"); // e.g. "2026-03-04" or empty = all

        // 1. Fetch companies (optionally filter by date)
        let companiesQuery = supabaseAdmin.from("companies").select("id, name, room_number, interview_date").order("interview_date").order("name");
        if (date) companiesQuery = companiesQuery.eq("interview_date", date);
        const { data: companies } = await companiesQuery;
        const companyMap: Record<string, { name: string; room_number: string; interview_date: string }> = {};
        for (const c of companies || []) companyMap[c.id] = { name: c.name, room_number: c.room_number, interview_date: c.interview_date };

        const companyIds = Object.keys(companyMap);

        // 2. Fetch queue tickets for those companies (all statuses)
        let ticketsQuery = supabaseAdmin
            .from("queue_tickets")
            .select("id, registration_id, company_id, status, position, visit_order, created_at, interview_started_at, interview_ended_at, interview_duration_minutes");

        if (companyIds.length > 0) {
            ticketsQuery = ticketsQuery.in("company_id", companyIds);
        }
        const { data: tickets } = await ticketsQuery;

        // 3. Fetch all relevant registrations
        const registrationIds = [...new Set((tickets || []).map(t => t.registration_id))];

        type RegRow = { id: string; full_name: string; student_number: string; email: string; contact_number: string; faculty: string; department: string; level: string; employment_type: string; job_opportunities: string; companies_march3: string; companies_march4: string; is_present: boolean; created_at: string; };

        const { data: registrations } = registrationIds.length > 0
            ? await supabaseAdmin
                .from("registrations")
                .select("id, full_name, student_number, email, contact_number, faculty, department, level, employment_type, job_opportunities, companies_march3, companies_march4, is_present, created_at")
                .in("id", registrationIds)
            : { data: [] as RegRow[] };

        const regMap: Record<string, RegRow> = {};
        for (const r of (registrations as RegRow[]) || []) regMap[r.id] = r;


        // 4. Build flat rows — one row per ticket (person × company visit)
        const rows = (tickets || []).map(ticket => {
            const reg = regMap[ticket.registration_id] || {};
            const company = companyMap[ticket.company_id] || {};
            const fmt = (d: string | null) => d ? new Date(d).toLocaleString("en-GB", { timeZone: "Asia/Colombo" }) : "";
            return {
                // Registration info
                full_name: reg.full_name || "",
                student_number: reg.student_number || "",
                email: reg.email || "",
                contact_number: reg.contact_number || "",
                faculty: reg.faculty || "",
                department: reg.department || "",
                level: reg.level || "",
                employment_type: reg.employment_type || "",
                job_opportunities: reg.job_opportunities || "",
                registered_at: fmt(reg.created_at),
                is_present: reg.is_present ? "Yes" : "No",
                // Company/Queue info
                company: company.name || "",
                room_number: company.room_number || "",
                interview_date: company.interview_date || "",
                queue_status: ticket.status,
                queue_position: ticket.position,
                queue_created_at: fmt(ticket.created_at),
                // Interview timings
                interview_started_at: fmt(ticket.interview_started_at),
                interview_ended_at: fmt(ticket.interview_ended_at),
                interview_duration_minutes: ticket.interview_duration_minutes ?? "",
            };
        });

        // 5. Build CSV
        const headers = [
            "Full Name", "Student Number", "Email", "Contact Number",
            "Faculty", "Department", "Level", "Employment Type", "Job Opportunities",
            "Registered At", "Is Present",
            "Company", "Room Number", "Interview Date",
            "Queue Status", "Queue Position", "Queued At",
            "Interview Started At", "Interview Ended At", "Interview Duration (mins)"
        ];

        const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

        const csv = [
            headers.join(","),
            ...rows.map(r => [
                escape(r.full_name), escape(r.student_number), escape(r.email), escape(r.contact_number),
                escape(r.faculty), escape(r.department), escape(r.level), escape(r.employment_type), escape(r.job_opportunities),
                escape(r.registered_at), escape(r.is_present),
                escape(r.company), escape(r.room_number), escape(r.interview_date),
                escape(r.queue_status), escape(r.queue_position), escape(r.queue_created_at),
                escape(r.interview_started_at), escape(r.interview_ended_at), escape(r.interview_duration_minutes),
            ].join(","))
        ].join("\n");

        const dateLabel = date || "all";
        return new NextResponse(csv, {
            headers: {
                "Content-Type": "text/csv",
                "Content-Disposition": `attachment; filename="career_fair_audit_${dateLabel}.csv"`,
            },
        });
    } catch (err: any) {
        console.error("Audit export error:", err);
        return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
    }
}
