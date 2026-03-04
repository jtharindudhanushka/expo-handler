import { createClient } from "@supabase/supabase-js";
import { allocateQueuePositions } from "@/lib/queue";
import { NextRequest, NextResponse } from "next/server";

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

function getTodayDate(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();

        // 1. Validate required fields
        if (!body.full_name || !body.student_number || !body.email || !body.contact_number || !body.level || !body.faculty || !body.university) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const today = getTodayDate();

        // 2. Insert into registrations — mark as present immediately (walk-in)
        const insertData = {
            full_name: body.full_name,
            university: body.university,
            student_number: body.student_number,
            email: body.email,
            contact_number: body.contact_number,
            faculty: body.faculty,
            level: body.level,
            department: body.department,
            employment_type: body.employment_type,
            companies_march3: body.companies_march3,
            companies_march4: body.companies_march4,
            job_opportunities: body.job_opportunities,
            cv_link: body.cv_link,
            is_present: true,  // Walk-in = already physically present
        };

        const { data: reg, error: regErr } = await supabaseAdmin
            .from("registrations")
            .insert(insertData)
            .select()
            .single();

        if (regErr) throw regErr;

        // 3. Allocate Queue — ONLY for today's companies (arrival-order queue)
        //    Future-day companies will be queued when they arrive on that day
        const allCompanyIds: string[] = body.allCompanyIds || [];

        if (allCompanyIds.length > 0) {
            // Fetch which of their selected companies are for today
            const { data: todayCompanies } = await supabaseAdmin
                .from("companies")
                .select("id")
                .in("id", allCompanyIds)
                .eq("interview_date", today);

            const todayIds = (todayCompanies || []).map((c: { id: string }) => c.id);

            // Queue for today immediately
            if (todayIds.length > 0) {
                await allocateQueuePositions(supabaseAdmin, reg.id, todayIds);
            }

            // For future days (not today), don't create tickets yet —
            // they will be created when the person arrives and is marked present on that day
        }

        return NextResponse.json({ success: true, registrationId: reg.id, markedPresent: true });
    } catch (err: any) {
        console.error("Registration error:", err);
        return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
    }
}

