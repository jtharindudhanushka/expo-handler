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
        const { registrationId, isPresent } = body;

        if (!registrationId || typeof isPresent !== "boolean") {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        // Must be logged in
        const supabase = await createServerSupabaseClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        // Update the database via service key to bypass RLS
        const { error } = await supabaseAdmin
            .from("registrations")
            .update({ is_present: isPresent })
            .eq("id", registrationId);

        if (error) throw error;

        return NextResponse.json({ success: true, is_present: isPresent });
    } catch (err: any) {
        console.error("Attendance update error:", err);
        return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
    }
}
