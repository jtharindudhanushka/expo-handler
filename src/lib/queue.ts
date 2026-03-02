import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Intelligent Queue Allocation — ADDITIVE
 *
 * Appends a new registrant to the END of each company's queue.
 * Uses MAX(position) + 1 so existing tickets are NEVER disturbed,
 * even after tickets have moved to completed/skipped.
 *
 * Visit order suggestion: person starts at the company whose pending
 * queue is currently shortest (least waiting time).
 *
 * @param supabase       - Service-role Supabase client
 * @param registrationId - UUID of the new registration
 * @param companyIds     - Company UUIDs the person selected
 * @returns number of tickets created
 */
export async function allocateQueuePositions(
    supabase: SupabaseClient,
    registrationId: string,
    companyIds: string[]
): Promise<number> {
    if (!companyIds.length) return 0;

    // 1. Get the MAX position ever used for each company (across ALL statuses)
    //    This guarantees a new person always goes to the END.
    const { data: maxRows } = await supabase
        .from("queue_tickets")
        .select("company_id, position, status")
        .in("company_id", companyIds);

    const maxPosition: Record<string, number> = {};
    for (const id of companyIds) maxPosition[id] = 0;
    for (const t of maxRows || []) {
        if ((t.position || 0) > (maxPosition[t.company_id] || 0)) {
            maxPosition[t.company_id] = t.position;
        }
    }

    // 2. Count ACTIVE (pending/called/interviewing) tickets per company
    //    Used only for visit_order suggestion (shortest active queue = go first)
    const activeCount: Record<string, number> = {};
    for (const id of companyIds) activeCount[id] = 0;
    for (const t of maxRows || []) {
        if (["pending", "called", "interviewing"].includes(t.status)) {
            activeCount[t.company_id] = (activeCount[t.company_id] || 0) + 1;
        }
    }

    // 3. Sort company IDs by active queue length ascending (shortest first)
    const sortedByActivity = [...companyIds].sort(
        (a, b) => (activeCount[a] || 0) - (activeCount[b] || 0)
    );

    // 4. Build tickets: position = MAX + 1 (never overwrites existing)
    const tickets = sortedByActivity.map((company_id, visitOrder) => ({
        registration_id: registrationId,
        company_id,
        status: "pending",
        position: (maxPosition[company_id] || 0) + 1,
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
