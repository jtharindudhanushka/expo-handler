import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";
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
        const { registrationId, isPresent, attendanceDate } = body;

        if (!registrationId || typeof isPresent !== "boolean") {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        // Must be logged in
        const supabase = await createServerSupabaseClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        // Update the attendance flag
        const { error: updateError } = await supabaseAdmin
            .from("registrations")
            .update({ is_present: isPresent })
            .eq("id", registrationId);

        if (updateError) throw updateError;

        // ─── Arrival-based queue allocation ───────────────────────────────────
        // Only run queue logic if a specific date is provided (Day 2 flow)
        if (attendanceDate) {
            if (isPresent) {
                // 1. Fetch registration's company column for this date
                //    companies_march3 / companies_march4 raw text columns
                const dateKey = attendanceDate === "2026-03-03" ? "companies_march3" : "companies_march4";
                const { data: reg } = await supabaseAdmin
                    .from("registrations")
                    .select(`id, ${dateKey}`)
                    .eq("id", registrationId)
                    .single();

                const rawCompanies: string = (reg as any)?.[dateKey] || "";
                const companyNames = rawCompanies
                    .split(/[;,]/)
                    .map((s: string) => s.trim())
                    .filter(Boolean);

                if (companyNames.length > 0) {
                    // 2. Resolve company names → IDs for this date
                    const { data: companies } = await supabaseAdmin
                        .from("companies")
                        .select("id, name")
                        .eq("interview_date", attendanceDate)
                        .in("name", companyNames);

                    const companyIds = (companies || []).map((c: { id: string }) => c.id);

                    // 3. Check which companies already have an active ticket for this person
                    if (companyIds.length > 0) {
                        const { data: existingTickets } = await supabaseAdmin
                            .from("queue_tickets")
                            .select("company_id, status")
                            .eq("registration_id", registrationId)
                            .in("company_id", companyIds)
                            .in("status", ["pending", "called", "interviewing"]);

                        const alreadyQueuedIds = new Set(
                            (existingTickets || []).map((t: { company_id: string }) => t.company_id)
                        );

                        // 4. Only create tickets for companies not already queued
                        const newCompanyIds = companyIds.filter((id: string) => !alreadyQueuedIds.has(id));
                        if (newCompanyIds.length > 0) {
                            await allocateQueuePositions(supabaseAdmin, registrationId, newCompanyIds);
                        }
                    }
                }
            } else {
                // When marking AWAY: remove pending tickets for today's date to free up queue slots
                // (Don't remove called/interviewing — they're already being processed)
                const { data: companies } = await supabaseAdmin
                    .from("companies")
                    .select("id")
                    .eq("interview_date", attendanceDate);

                const companyIds = (companies || []).map((c: { id: string }) => c.id);

                if (companyIds.length > 0) {
                    await supabaseAdmin
                        .from("queue_tickets")
                        .delete()
                        .eq("registration_id", registrationId)
                        .in("company_id", companyIds)
                        .eq("status", "pending");
                }
            }
        }

        return NextResponse.json({ success: true, is_present: isPresent });
    } catch (err: any) {
        console.error("Attendance update error:", err);
        return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
    }
}
