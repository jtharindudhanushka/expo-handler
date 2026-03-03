import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { allocateQueuePositions } from "@/lib/queue";

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

async function isAuthorized() {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    return profile?.role === "admin" || profile?.role === "receptionist";
}

export async function POST(req: NextRequest) {
    try {
        if (!(await isAuthorized())) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        const { registrationId, removeTicketIds, addCompanyIds } = await req.json();

        if (!registrationId) {
            return NextResponse.json({ error: "Missing registrationId" }, { status: 400 });
        }

        let removedCount = 0;
        let addedCount = 0;

        // 1. Remove requested tickets
        if (Array.isArray(removeTicketIds) && removeTicketIds.length > 0) {
            const { error: delErr } = await supabaseAdmin
                .from("queue_tickets")
                .delete()
                .in("id", removeTicketIds)
                .eq("registration_id", registrationId);

            if (delErr) {
                console.error("Error removing tickets:", delErr);
                return NextResponse.json({ error: "Failed to remove existing queues" }, { status: 500 });
            }
            removedCount = removeTicketIds.length;
        }

        // 2. Add new queue assignments
        if (Array.isArray(addCompanyIds) && addCompanyIds.length > 0) {
            // We ensure they aren't already waiting for these companies
            const { data: existing } = await supabaseAdmin
                .from("queue_tickets")
                .select("company_id")
                .eq("registration_id", registrationId)
                .in("company_id", addCompanyIds)
                .in("status", ["pending", "called", "interviewing"]);

            const existingCompanyIds = new Set((existing || []).map(t => t.company_id));
            const distinctNewCompanies = addCompanyIds.filter(id => !existingCompanyIds.has(id));

            if (distinctNewCompanies.length > 0) {
                addedCount = await allocateQueuePositions(supabaseAdmin, registrationId, distinctNewCompanies);
            }
        }

        return NextResponse.json({ success: true, removedCount, addedCount });

    } catch (err: any) {
        console.error("Queue update error:", err);
        return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
    }
}
