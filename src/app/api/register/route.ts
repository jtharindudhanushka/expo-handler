import { createClient } from "@supabase/supabase-js";
import { allocateQueuePositions } from "@/lib/queue";
import { NextRequest, NextResponse } from "next/server";

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();

        // 1. Validate required fields
        if (!body.full_name || !body.student_number || !body.email || !body.contact_number || !body.level || !body.faculty || !body.university) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        // 2. Insert into registrations
        // created_at is strictly handled by the database
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
        };

        const { data: reg, error: regErr } = await supabaseAdmin
            .from("registrations")
            .insert(insertData)
            .select()
            .single();

        if (regErr) throw regErr;

        // 3. Allocate Queue
        if (body.allCompanyIds && body.allCompanyIds.length > 0) {
            await allocateQueuePositions(supabaseAdmin, reg.id, body.allCompanyIds);
        }

        return NextResponse.json({ success: true, registration: reg });
    } catch (err: any) {
        console.error("Registration error:", err);
        return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
    }
}
