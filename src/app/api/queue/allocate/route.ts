import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { allocateQueuePositions } from "@/lib/queue";
import { NextRequest, NextResponse } from "next/server";

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

/**
 * POST /api/queue/allocate
 * Body: { registrationId: string, companyIds: string[] }
 * Creates queue tickets with intelligent ordering (least-busy company first).
 * Callable by authenticated users (on-spot registration) and admin (import).
 */
export async function POST(req: NextRequest) {
    // Verify the caller is authenticated
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { registrationId, companyIds } = await req.json();

    if (!registrationId || !Array.isArray(companyIds) || companyIds.length === 0) {
        return NextResponse.json({ error: "Missing registrationId or companyIds" }, { status: 400 });
    }

    // Use service-role client so anon registrants can trigger allocation
    // (the registration itself is already inserted with their session)
    const ticketsCreated = await allocateQueuePositions(
        supabaseAdmin,
        registrationId,
        companyIds
    );

    return NextResponse.json({ ticketsCreated });
}
