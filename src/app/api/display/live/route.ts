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
                .select("id, name, interview_date, room_number")
                .eq("interview_date", date)
                .order("name"),
            supabase
                .from("queue_tickets")
                .select("id, company_id, status, position, registration:registrations(full_name, student_number)")
                .in("status", ["pending", "called", "interviewing"]),
        ]);

        // Obfuscate student numbers before sending to public display
        const safeTickets = (tickets || []).map(t => {
            const reg: any = Array.isArray(t.registration) ? t.registration[0] : t.registration;
            if (reg && typeof reg.student_number === "string" && reg.student_number.length > 2) {
                const s = reg.student_number;
                // e.g. "CB012345" -> "CB012***"
                const visibleLen = Math.max(2, s.length - 3);
                reg.student_number = s.substring(0, visibleLen) + "*".repeat(s.length - visibleLen);
            }
            return t;
        });

        return NextResponse.json({
            companies: comps || [],
            tickets: safeTickets,
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
