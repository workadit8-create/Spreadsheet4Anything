import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import { fetchPenjualanHistory } from "@/lib/penjualan/fetch-history-data";

function parseDateRange(url: string) {
  const { searchParams } = new URL(url);
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const defaultStart = firstDay.toISOString().slice(0, 10);
  const defaultEnd = today.toISOString().slice(0, 10);

  const start = searchParams.get("start") || defaultStart;
  const end = searchParams.get("end") || defaultEnd;
  const customerId = searchParams.get("customer_id") || undefined;

  return { start, end, customerId };
}

export async function GET(request: Request) {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch (e) {
    return toOrgAuthResponse(e);
  }
  const { user, org } = auth;

  const filters = parseDateRange(request.url);

  try {
    const bundle = await fetchPenjualanHistory(supabase, org.id, filters);
    return NextResponse.json({
      rows: bundle.rows,
      grandTotalSum: bundle.grandTotalSum,
      filters
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal memuat riwayat" },
      { status: 500 }
    );
  }
}
