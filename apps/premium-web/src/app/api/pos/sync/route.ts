import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAddon } from "@/lib/org/addons";
import { requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import { processPosCheckout, type PosCheckoutInput } from "@/lib/pos/checkout";

type SyncBody = {
  transactions?: Array<PosCheckoutInput & { local_id: string }>;
};

export async function POST(request: Request) {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch (e) {
    return toOrgAuthResponse(e);
  }

  try {
    await requireAddon(supabase, auth.org.id, "pos");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Add-on POS tidak aktif" },
      { status: 403 }
    );
  }

  const body = (await request.json()) as SyncBody;
  const transactions = Array.isArray(body.transactions) ? body.transactions : [];

  if (!transactions.length) {
    return NextResponse.json({ error: "Tidak ada transaksi untuk sync" }, { status: 400 });
  }

  const results: Array<{
    local_id: string;
    ok: boolean;
    orderNo?: string;
    error?: string;
    idempotentReplay?: boolean;
  }> = [];

  for (const tx of transactions) {
    const localId = String(tx.local_id || "").trim();
    if (!localId) {
      results.push({ local_id: "", ok: false, error: "local_id wajib" });
      continue;
    }
    try {
      const result = await processPosCheckout(supabase, auth.org.id, auth.user?.id ?? null, {
        ...tx,
        local_id: localId
      });
      results.push({
        local_id: localId,
        ok: true,
        orderNo: result.orderNo,
        idempotentReplay: result.idempotentReplay
      });
    } catch (err) {
      results.push({
        local_id: localId,
        ok: false,
        error: err instanceof Error ? err.message : "Sync gagal"
      });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  return NextResponse.json({
    ok: okCount === results.length,
    synced: okCount,
    total: results.length,
    results
  });
}
