import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { NextRequest, NextResponse } from "next/server";

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { ticketId, newStatus, companyId } = body;

        if (!ticketId || !newStatus || !companyId) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        // Auth
        const supabase = await createServerSupabaseClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { data: profile } = await supabase.from("profiles").select("role, company_id").eq("id", user.id).single();
        if (!profile || (profile.role !== "admin" && profile.company_id !== companyId)) {
            return NextResponse.json({ error: "Forbidden - company_id mismatch" }, { status: 403 });
        }

        // If recalling (newStatus === "pending")
        if (newStatus === "pending") {
            // Get MAX position atomically
            const { data: maxRows } = await supabaseAdmin
                .from("queue_tickets")
                .select("position")
                .eq("company_id", companyId)
                .order("position", { ascending: false })
                .limit(1);

            const maxPos = maxRows?.[0]?.position ?? 0;

            const { error: updErr } = await supabaseAdmin
                .from("queue_tickets")
                .update({ status: "pending", position: maxPos + 1 })
                .eq("id", ticketId)
                .eq("company_id", companyId);

            if (updErr) throw updErr;
        } else {
            // Build update payload with tracking timestamps
            const now = new Date().toISOString();
            const updatePayload: Record<string, unknown> = { status: newStatus };

            if (newStatus === "interviewing") {
                // Record when the interview actually began
                updatePayload.interview_started_at = now;
                updatePayload.interview_ended_at = null;
                updatePayload.interview_duration_minutes = null;
            } else if (newStatus === "completed" || newStatus === "skipped") {
                // Record when it ended and calculate duration
                updatePayload.interview_ended_at = now;

                // Fetch the start time to calculate duration
                const { data: ticket } = await supabaseAdmin
                    .from("queue_tickets")
                    .select("interview_started_at")
                    .eq("id", ticketId)
                    .single();

                if (ticket?.interview_started_at) {
                    const startMs = new Date(ticket.interview_started_at).getTime();
                    const durationMins = Math.round((new Date(now).getTime() - startMs) / 60000);
                    updatePayload.interview_duration_minutes = durationMins;
                }
            }

            const { error: updErr } = await supabaseAdmin
                .from("queue_tickets")
                .update(updatePayload)
                .eq("id", ticketId)
                .eq("company_id", companyId);

            if (updErr) throw updErr;
        }

        return NextResponse.json({ success: true });
    } catch (err: any) {
        console.error("Room update error:", err);
        return NextResponse.json({ error: err.message || "Internal server error", code: err.code }, { status: 500 });
    }
}
