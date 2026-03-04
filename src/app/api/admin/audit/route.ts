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

        // 1. Fetch companies for the selected date (sorted deterministically for column order)
        let companiesQuery = supabaseAdmin
            .from("companies")
            .select("id, name, room_number, interview_date")
            .order("interview_date")
            .order("name");
        if (date) companiesQuery = companiesQuery.eq("interview_date", date);
        const { data: companies } = await companiesQuery;
        const companyList = companies || [];
        const companyMap: Record<string, { name: string; room_number: string; interview_date: string }> = {};
        for (const c of companyList) companyMap[c.id] = { name: c.name, room_number: c.room_number, interview_date: c.interview_date };
        const companyIds = companyList.map(c => c.id);

        // 2. Fetch ALL queue tickets for those companies
        const { data: tickets } = companyIds.length > 0
            ? await supabaseAdmin
                .from("queue_tickets")
                .select("id, registration_id, company_id, status, position, created_at, interview_started_at, interview_ended_at, interview_duration_minutes")
                .in("company_id", companyIds)
            : { data: [] };

        // 3. Group tickets by registration_id → company_id
        type TicketRow = {
            id: string; company_id: string; status: string; position: number;
            created_at: string; interview_started_at: string | null;
            interview_ended_at: string | null; interview_duration_minutes: number | null;
        };
        const ticketsByReg: Record<string, Record<string, TicketRow>> = {};
        for (const t of (tickets || []) as TicketRow[]) {
            if (!ticketsByReg[t.registration_id]) ticketsByReg[t.registration_id] = {};
            ticketsByReg[t.registration_id][t.company_id] = t;
        }

        // 4. Fetch all relevant registrations (anyone who has at least one ticket)
        const registrationIds = Object.keys(ticketsByReg);

        type RegRow = {
            id: string; university: string; full_name: string; student_number: string;
            email: string; contact_number: string; faculty: string; department: string;
            level: string; employment_type: string; job_opportunities: string;
            companies_march3: string; companies_march4: string;
            is_present: boolean; created_at: string; cv_link: string;
        };

        const { data: registrations } = registrationIds.length > 0
            ? await supabaseAdmin
                .from("registrations")
                .select("id, university, full_name, student_number, email, contact_number, faculty, department, level, employment_type, job_opportunities, companies_march3, companies_march4, is_present, created_at, cv_link")
                .in("id", registrationIds)
                .order("full_name")
            : { data: [] as RegRow[] };

        // 5. Build headers — fixed personal info columns + dynamic per-company columns
        const fmt = (d: string | null) => d ? new Date(d).toLocaleString("en-GB", { timeZone: "Asia/Colombo" }) : "";

        const personalHeaders = [
            "Full Name", "University", "Student Number", "Email", "Contact Number",
            "Faculty", "Department", "Level", "Employment Type", "Job Opportunities", "CV Link",
            "Companies Selected (March 3)", "Companies Selected (March 4)",
            "Registered At", "Is Present",
        ];

        // For each company: 6 columns
        const companyHeaders: string[] = [];
        for (const c of companyList) {
            const label = `${c.name} (${c.interview_date})`;
            companyHeaders.push(
                `${label} - Status`,
                `${label} - Queue Position`,
                `${label} - Queued At`,
                `${label} - Interview Started`,
                `${label} - Interview Ended`,
                `${label} - Duration (mins)`,
            );
        }

        const headers = [...personalHeaders, ...companyHeaders];

        // 6. Build one row per registrant
        const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

        const rows = ((registrations as RegRow[]) || []).map(reg => {
            const personalCols = [
                escape(reg.full_name),
                escape(reg.university),
                escape(reg.student_number),
                escape(reg.email),
                escape(reg.contact_number),
                escape(reg.faculty),
                escape(reg.department),
                escape(reg.level),
                escape(reg.employment_type),
                escape(reg.job_opportunities),
                escape(reg.cv_link),
                escape(reg.companies_march3),
                escape(reg.companies_march4),
                escape(fmt(reg.created_at)),
                escape(reg.is_present ? "Yes" : "No"),
            ];

            const companyCols: string[] = [];
            for (const c of companyList) {
                const ticket = ticketsByReg[reg.id]?.[c.id];
                if (ticket) {
                    companyCols.push(
                        escape(ticket.status),
                        escape(ticket.position),
                        escape(fmt(ticket.created_at)),
                        escape(fmt(ticket.interview_started_at)),
                        escape(fmt(ticket.interview_ended_at)),
                        escape(ticket.interview_duration_minutes ?? ""),
                    );
                } else {
                    // Not queued for this company — fill with blanks
                    companyCols.push("", "", "", "", "", "");
                }
            }

            return [...personalCols, ...companyCols].join(",");
        });

        const csv = [headers.join(","), ...rows].join("\n");

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
