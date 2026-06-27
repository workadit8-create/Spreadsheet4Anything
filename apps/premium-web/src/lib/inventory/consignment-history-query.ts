import { wibMonthStartIso, wibTodayIso } from "@/lib/date/wib";

export type ConsignmentHistoryQuery = {
  start: string;
  end: string;
  supplierId?: string;
  limit: number;
};

export function parseConsignmentHistoryQuery(url: string): ConsignmentHistoryQuery {
  const { searchParams } = new URL(url);
  return {
    start: searchParams.get("start") || wibMonthStartIso(),
    end: searchParams.get("end") || wibTodayIso(),
    supplierId: searchParams.get("supplier_id")?.trim() || undefined,
    limit: Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 50))
  };
}
