import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserPrimaryOrg } from "@/lib/org/get-user-org";
import { fetchJournalsBySource } from "@/lib/jurnal/fetch-by-source";

const ALLOWED_SOURCE_TYPES = new Set([
  "SALES_ORDER",
  "PURCHASE_ORDER",
  "CASH_TRANSFER",
  "PIUTANG_PAYMENT",
  "UTANG_PAYMENT",
  "CICILAN_BANK"
]);

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const org = await getUserPrimaryOrg(supabase);
  if (!org) return NextResponse.json({ error: "Tidak ada organisasi" }, { status: 400 });

  const url = new URL(request.url);
  const sourceType = String(url.searchParams.get("source_type") || "").trim().toUpperCase();
  const sourceId = String(url.searchParams.get("source_id") || "").trim();

  if (!sourceType || !sourceId) {
    return NextResponse.json({ error: "source_type dan source_id wajib" }, { status: 400 });
  }
  if (!ALLOWED_SOURCE_TYPES.has(sourceType)) {
    return NextResponse.json({ error: "source_type tidak valid" }, { status: 400 });
  }

  try {
    const result = await fetchJournalsBySource(supabase, org.id, sourceType, sourceId);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal memuat jurnal" },
      { status: 500 }
    );
  }
}
