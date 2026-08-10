import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  PRIORITY_ORDER,
  emptyPriorityCounts,
  mapEnquiryDetailRow,
  mapEnquirySummaryRow,
  type EnquiryDetailRow,
  type EnquirySummaryRow,
  type LiveEnquiryDetail,
  type LiveEnquirySummary,
  type PriorityCounts,
} from "./live-enquiries";

const SUMMARY_SELECT = [
  "public_reference",
  "submitted_at",
  "priority",
  "category",
  "status",
  "assigned_staff_membership_id",
  "location_status",
  "preferred_contact_method",
  "preferred_contact_time",
].join(",");

const DETAIL_SELECT = [
  SUMMARY_SELECT,
  "full_name",
  "email",
  "phone",
  "intake_answers",
  "priority_reason",
  "matched_rule_ids",
  "conflict_check_state",
].join(",");

export async function readEnquiryQueueForFirm(firmId: string): Promise<{
  enquiries: LiveEnquirySummary[];
  counts: PriorityCounts;
  totalCount: number;
  hasMore: boolean;
}> {
  const supabase = createSupabaseServerClient();

  const [{ data, error }, countResults] = await Promise.all([
    supabase
      .from("enquiries")
      .select(SUMMARY_SELECT)
      .eq("firm_id", firmId)
      .order("submitted_at", { ascending: false })
      .limit(200),
    Promise.all(
      PRIORITY_ORDER.map(async (priority) => {
        const { count, error: countError } = await supabase
          .from("enquiries")
          .select("id", { count: "exact", head: true })
          .eq("firm_id", firmId)
          .eq("priority", priority);
        if (countError) throw countError;
        return [priority, count ?? 0] as const;
      }),
    ),
  ]);

  if (error) throw error;

  const counts = emptyPriorityCounts();
  for (const [priority, count] of countResults) counts[priority] = count;

  const enquiries = ((data ?? []) as unknown as EnquirySummaryRow[]).map(mapEnquirySummaryRow);
  const totalCount = PRIORITY_ORDER.reduce((total, priority) => total + counts[priority], 0);

  return {
    enquiries,
    counts,
    totalCount,
    hasMore: totalCount > enquiries.length,
  };
}

export async function readEnquiryDetailForFirm(
  firmId: string,
  publicReference: string,
): Promise<LiveEnquiryDetail | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("enquiries")
    .select(DETAIL_SELECT)
    .eq("firm_id", firmId)
    .eq("public_reference", publicReference)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return mapEnquiryDetailRow(data as unknown as EnquiryDetailRow);
}
