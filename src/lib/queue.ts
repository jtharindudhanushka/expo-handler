import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Intelligent Queue Allocation
 *
 * Given a registration and their selected company IDs, assigns queue tickets
 * such that the person starts at the company with the shortest current queue.
 *
 * Algorithm:
 *  1. Fetch current queue length (pending/called/interviewing) for each company
 *  2. Sort companies by queue length ascending (visit least busy first)
 *  3. Insert a ticket for each company with position = current_length + 1
 *
 * @param supabase   - Any Supabase client (anon or service role)
 * @param registrationId - UUID of the registration
 * @param companyIds - Array of company UUIDs the person selected
 * @returns number of tickets created
 */
export async function allocateQueuePositions(
    supabase: SupabaseClient,
    registrationId: string,
    companyIds: string[]
): Promise<number> {
    if (!companyIds.length) return 0;

    // 1. Get current active queue length for each relevant company
    const { data: existingTickets } = await supabase
        .from("queue_tickets")
        .select("company_id, status")
        .in("company_id", companyIds)
        .in("status", ["pending", "called", "interviewing"]);

    // Count per company
    const queueLengths: Record<string, number> = {};
    for (const id of companyIds) queueLengths[id] = 0;
    for (const t of existingTickets || []) {
        queueLengths[t.company_id] = (queueLengths[t.company_id] || 0) + 1;
    }

    // 2. Sort companies by queue length (shortest first = go there first)
    const sorted = [...companyIds].sort(
        (a, b) => (queueLengths[a] || 0) - (queueLengths[b] || 0)
    );

    // 3. Build tickets: position = current length + 1 per company
    const tickets = sorted.map((company_id, visitOrder) => ({
        registration_id: registrationId,
        company_id,
        status: "pending",
        // position reflects where they are in THIS company's queue
        position: (queueLengths[company_id] || 0) + 1,
        // visit_order is the suggested sequence for the person (1 = go here first)
        visit_order: visitOrder + 1,
    }));

    const { data, error } = await supabase
        .from("queue_tickets")
        .insert(tickets)
        .select();

    if (error) {
        console.error("Queue allocation error:", error);
        return 0;
    }
    return data?.length || tickets.length;
}
