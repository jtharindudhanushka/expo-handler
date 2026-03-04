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
        const supabase = await createServerSupabaseClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        // Only admins/receptionists can reset
        const { data: profile } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .single();

        if (profile?.role !== "admin" && profile?.role !== "receptionist") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // Reset all is_present flags to false
        const { error } = await supabaseAdmin
            .from("registrations")
            .update({ is_present: false })
            .neq("id", "00000000-0000-0000-0000-000000000000"); // match all rows

        if (error) throw error;

        return NextResponse.json({ success: true });
    } catch (err: any) {
        console.error("Reset attendance error:", err);
        return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
    }
}
