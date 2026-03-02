import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { allocateQueuePositions } from "@/lib/queue";
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

/** Split a cell value that may contain multiple companies separated by commas or semicolons */
function splitCompanies(value: string | null): string[] {
    if (!value) return [];
    return value
        .split(/[;,]/)
        .map(s => s.trim())
        .filter(Boolean);
}

/**
 * Parse a CSV timestamp in DD/MM/YYYY HH:MM:SS format into an ISO-8601 string.
 * Returns null if the string is empty or unrecognised.
 * e.g. "01/03/2026 13:57:43" → "2026-03-01T13:57:43.000Z"
 */
function parseCsvTimestamp(raw: string | null | undefined): string | null {
    if (!raw) return null;
    // Match DD/MM/YYYY HH:MM:SS  (also handles D/M/YYYY)
    const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{2}):(\d{2}):(\d{2})/);
    if (!m) return null;
    const [, dd, mm, yyyy, hh, min, ss] = m;
    // Build as UTC (the event is local, but we just want a consistent sortable value)
    const iso = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}T${hh}:${min}:${ss}.000Z`;
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : iso;
}

export async function POST(req: NextRequest) {
    if (!(await isAdmin())) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { rows } = await req.json();

    if (!Array.isArray(rows) || rows.length === 0) {
        return NextResponse.json({ error: "No rows provided" }, { status: 400 });
    }

    // Clean rows: set defaults and remove completely empty ones
    const cleanRows = rows.map((r: Record<string, string>) => ({
        timestamp: parseCsvTimestamp(r.timestamp) ?? r.timestamp ?? null,
        full_name: r.full_name?.trim() || null,
        university: r.university?.trim() || null,
        student_number: r.student_number?.trim() || null,
        email: r.email?.trim() || null,
        contact_number: r.contact_number?.trim() || null,
        faculty: r.faculty?.trim() || null,
        level: r.level?.trim() || null,
        department: r.department?.trim() || null,
        employment_type: r.employment_type?.trim() || null,
        companies_march3: r.companies_march3?.trim() || null,
        companies_march4: r.companies_march4?.trim() || null,
        job_opportunities: r.job_opportunities?.trim() || null,
        cv_link: r.cv_link?.trim() || null,
    })).filter(r => r.full_name);

    // ── Step 1: Extract unique company names per date ─────────────────────
    const march3Names = new Set<string>();
    const march4Names = new Set<string>();

    for (const r of cleanRows) {
        splitCompanies(r.companies_march3).forEach(n => march3Names.add(n));
        splitCompanies(r.companies_march4).forEach(n => march4Names.add(n));
    }

    // Fetch existing companies so we don't duplicate
    const { data: existingCompanies } = await supabaseAdmin
        .from("companies")
        .select("name, interview_date");

    const existingKeys = new Set(
        (existingCompanies || []).map((c: { name: string; interview_date: string }) => `${c.name}|${c.interview_date}`)
    );

    // Build new company inserts
    const companiesToInsert: { name: string; room_number: string; interview_date: string }[] = [];
    let roomCounter = (existingCompanies?.length || 0) + 1;

    const addIfNew = (name: string, date: string) => {
        const key = `${name}|${date}`;
        if (!existingKeys.has(key)) {
            existingKeys.add(key); // prevent duplicate within this batch
            companiesToInsert.push({
                name,
                room_number: `Room ${roomCounter++}`,
                interview_date: date,
            });
        }
    };

    march3Names.forEach(name => addIfNew(name, "2026-03-03"));
    march4Names.forEach(name => addIfNew(name, "2026-03-04"));

    let companiesCreated = 0;
    if (companiesToInsert.length > 0) {
        const { data: created, error: compErr } = await supabaseAdmin
            .from("companies")
            .insert(companiesToInsert)
            .select();
        if (!compErr) companiesCreated = created?.length || companiesToInsert.length;
        else console.error("Company insert error:", compErr);
    }

    // ── Step 2: Insert registrations one-by-one to track IDs for queue allocation ──
    // Fetch the full companies list so we can map name → id
    const { data: allCompanies } = await supabaseAdmin
        .from("companies")
        .select("id, name, interview_date");

    const companyNameToId = new Map<string, string>();
    for (const c of allCompanies || []) {
        companyNameToId.set(`${c.name}|${c.interview_date}`, c.id);
        // Also index by name alone (fallback)
        if (!companyNameToId.has(c.name)) companyNameToId.set(c.name, c.id);
    }

    let success = 0;
    let errors = 0;
    let ticketsCreated = 0;
    const chunkSize = 50;

    for (let i = 0; i < cleanRows.length; i += chunkSize) {
        const chunk = cleanRows.slice(i, i + chunkSize);
        const { error, data } = await supabaseAdmin
            .from("registrations")
            .insert(chunk)
            .select();

        if (error) {
            console.error("Import chunk error:", error);
            errors += chunk.length;
            continue;
        }

        success += data?.length || 0;

        // ── Step 3: Allocate queue positions for each inserted registration ──
        for (let j = 0; j < (data?.length || 0); j++) {
            const reg = data![j];
            const rawRow = chunk[j];

            // Resolve March 3 company names → IDs
            const march3Ids = rawRow.companies_march3
                ? rawRow.companies_march3.split(/[;,]/).map((n: string) => n.trim()).filter(Boolean)
                    .map((name: string) => companyNameToId.get(`${name}|2026-03-03`) || companyNameToId.get(name))
                    .filter((id: string | undefined): id is string => Boolean(id))
                : [];

            // Resolve March 4 company names → IDs
            const march4Ids = rawRow.companies_march4
                ? rawRow.companies_march4.split(/[;,]/).map((n: string) => n.trim()).filter(Boolean)
                    .map((name: string) => companyNameToId.get(`${name}|2026-03-04`) || companyNameToId.get(name))
                    .filter((id: string | undefined): id is string => Boolean(id))
                : [];

            const allIds = [...march3Ids, ...march4Ids];
            if (allIds.length > 0) {
                const t = await allocateQueuePositions(supabaseAdmin, reg.id, allIds);
                ticketsCreated += t;
            }
        }
    }

    return NextResponse.json({ success, errors, companiesCreated, ticketsCreated });
}
