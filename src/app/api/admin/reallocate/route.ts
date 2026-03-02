import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { NextRequest, NextResponse } from "next/server";

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

async function isAdmin() {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    return profile?.role === "admin";
}

/**
 * POST /api/admin/reallocate
 * Rebuilds all queue tickets from scratch, ordered by registration.created_at.
 * Algorithm:
 *   For each company:
 *     1. Find all registrations that mention the company name (march3 or march4 text field)
 *     2. Sort by created_at ASC (earliest registered = position 1)
 *     3. Delete existing tickets for this company
 *     4. Insert fresh tickets with position 1, 2, 3...
 */
export async function POST(req: NextRequest) {
    if (!(await isAdmin())) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Optional: scope to specific registration IDs (for future use)
    const body = await req.json().catch(() => ({}));
    const registrationIds: string[] | null = body.registrationIds ?? null;

    // 1. Fetch all companies
    const { data: companies, error: compErr } = await supabaseAdmin
        .from("companies")
        .select("id, name, interview_date");

    if (compErr || !companies) {
        return NextResponse.json({ error: "Failed to fetch companies" }, { status: 500 });
    }

    // 2. Fetch all registrations (or the specified ones)
    let regQuery = supabaseAdmin
        .from("registrations")
        .select("id, full_name, companies_march3, companies_march4, created_at, timestamp")
        .order("created_at", { ascending: true }); // rough pre-sort; refined below

    if (registrationIds && registrationIds.length > 0) {
        regQuery = regQuery.in("id", registrationIds);
    }

    const { data: registrations, error: regErr } = await regQuery;
    if (regErr || !registrations) {
        return NextResponse.json({ error: "Failed to fetch registrations" }, { status: 500 });
    }

    // 3. For the selected (or all) registrations, delete existing pending/active tickets
    let deleteQuery = supabaseAdmin
        .from("queue_tickets")
        .delete()
        .in("status", ["pending", "called", "interviewing"]);

    if (registrationIds && registrationIds.length > 0) {
        deleteQuery = deleteQuery.in("registration_id", registrationIds);
    }
    await deleteQuery;

    // 4. Build a lookup: company name (lowercase, trimmed) => company row
    const nameToCompany = new Map<string, { id: string; interview_date: string }>();
    for (const c of companies) {
        nameToCompany.set(c.name.toLowerCase().trim(), { id: c.id, interview_date: c.interview_date });
    }

    // 5. For each company, collect registrations that selected it, sorted by created_at
    //    Then insert tickets with position 1, 2, 3...
    let totalTickets = 0;

    for (const company of companies) {
        const companyKey = company.name.toLowerCase().trim();
        const march3Date = "2026-03-03";
        const march4Date = "2026-03-04";

        // Find registrations selecting this company on march3 or march4
        const forThisCompany = registrations.filter(r => {
            const march3Names = (r.companies_march3 || "").split(/[,;]/).map((s: string) => s.toLowerCase().trim());
            const march4Names = (r.companies_march4 || "").split(/[,;]/).map((s: string) => s.toLowerCase().trim());

            if (company.interview_date === march3Date) return march3Names.includes(companyKey);
            if (company.interview_date === march4Date) return march4Names.includes(companyKey);
            // Fallback: check both
            return march3Names.includes(companyKey) || march4Names.includes(companyKey);
        });

        // Prefer CSV timestamp field; fall back to DB created_at
        const getTime = (r: { timestamp?: string | null; created_at: string }) => {
            const ts = r.timestamp ? new Date(r.timestamp).getTime() : NaN;
            return isNaN(ts) ? new Date(r.created_at).getTime() : ts;
        };

        // Sort ascending: earliest registered = position 1
        const sorted = [...forThisCompany].sort((a, b) => getTime(a) - getTime(b));

        if (sorted.length === 0) continue;

        const tickets = sorted.map((reg, idx) => ({
            registration_id: reg.id,
            company_id: company.id,
            status: "pending",
            position: idx + 1,         // 1-indexed, based on registration time
            visit_order: 1,             // simplified — can be enhanced later
        }));

        const { data: inserted } = await supabaseAdmin
            .from("queue_tickets")
            .insert(tickets)
            .select();

        totalTickets += inserted?.length || 0;
    }

    return NextResponse.json({ ticketsCreated: totalTickets, companiesProcessed: companies.length });
}
