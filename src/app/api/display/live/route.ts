import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const date = searchParams.get("date");

        if (!date) {
            return NextResponse.json({ error: "Missing date" }, { status: 400 });
        }

        const supabase = await createServerSupabaseClient();

        const [{ data: comps }, { data: tickets }] = await Promise.all([
            supabase
                .from("companies")
                .select("id, name, interview_date")
                .eq("interview_date", date)
                .order("name"),
            supabase
                .from("queue_tickets")
                .select("id, company_id, status, position, registration:registrations(full_name, student_number)")
                .in("status", ["pending", "called", "interviewing"]),
        ]);

        return NextResponse.json({
            companies: comps || [],
            tickets: tickets || [],
        }, {
            headers: {
                "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
                Pragma: "no-cache",
                Expires: "0",
            },
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
