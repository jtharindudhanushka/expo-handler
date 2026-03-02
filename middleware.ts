import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
    let supabaseResponse = NextResponse.next({ request });

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) =>
                        request.cookies.set(name, value)
                    );
                    supabaseResponse = NextResponse.next({ request });
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    );
                },
            },
        }
    );

    const {
        data: { user },
    } = await supabase.auth.getUser();

    const { pathname } = request.nextUrl;

    // Public routes — anyone can access
    if (pathname === "/" || pathname === "/board" || pathname === "/login") {
        return supabaseResponse;
    }

    // Not logged in → redirect to login
    if (!user) {
        return NextResponse.redirect(new URL("/login", request.url));
    }

    // Get the user's role from profiles
    const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

    const role = profile?.role;

    // Room leads trying to access admin → redirect to room
    if (pathname.startsWith("/admin") && role !== "admin") {
        return NextResponse.redirect(new URL("/room", request.url));
    }

    // Non-room-leads trying to access /room → redirect to login
    if (pathname.startsWith("/room") && role !== "room_lead" && role !== "admin") {
        return NextResponse.redirect(new URL("/login", request.url));
    }

    return supabaseResponse;
}

export const config = {
    matcher: [
        "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    ],
};
