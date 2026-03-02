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
        timestamp: r.timestamp || null,
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

    // Batch insert in chunks of 100
    let success = 0;
    let errors = 0;
    const chunkSize = 100;

    for (let i = 0; i < cleanRows.length; i += chunkSize) {
        const chunk = cleanRows.slice(i, i + chunkSize);
        const { error, data } = await supabaseAdmin
            .from("registrations")
            .insert(chunk)
            .select();

        if (error) {
            console.error("Import chunk error:", error);
            errors += chunk.length;
        } else {
            success += data?.length || chunk.length;
        }
    }

    return NextResponse.json({ success, errors });
}
