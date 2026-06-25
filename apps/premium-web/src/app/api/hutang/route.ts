import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import { summarizeHutangFromLines } from "@/lib/posting/hutang";
import type { PurchaseLineRow } from "@/lib/posting/types";

export async function GET(request: Request) {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch (e) {
    return toOrgAuthResponse(e);
  }
  const { user, org } = auth;

  const url = new URL(request.url);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  const supplierId = url.searchParams.get("supplier_id");
  const allOutstanding = url.searchParams.get("all_outstanding") === "true";

  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("id, code, name")
    .eq("organization_id", org.id)
    .eq("active", true)
    .order("name");

  const supplierMap = new Map((suppliers || []).map((s) => [s.id, s.name]));

  let ordersQuery = supabase
    .from("purchase_orders")
    .select("id, po_no, order_date, total, supplier_id, metadata, status")
    .eq("organization_id", org.id)
    .in("status", ["CONFIRMED", "POSTED"])
    .order("order_date", { ascending: false });

  if (!allOutstanding) {
    if (start) ordersQuery = ordersQuery.gte("order_date", start);
    if (end) ordersQuery = ordersQuery.lte("order_date", end);
  }
  if (supplierId) ordersQuery = ordersQuery.eq("supplier_id", supplierId);

  const { data: orders, error: ordersErr } = await ordersQuery.limit(200);
  if (ordersErr) return NextResponse.json({ error: ordersErr.message }, { status: 500 });

  const orderIds = (orders || []).map((o) => o.id);
  const { data: lines } = orderIds.length
    ? await supabase.from("purchase_lines").select("*").in("purchase_order_id", orderIds)
    : { data: [] };

  const linesByOrder = new Map<string, PurchaseLineRow[]>();
  (lines || []).forEach((line) => {
    const list = linesByOrder.get(line.purchase_order_id) || [];
    list.push(line as PurchaseLineRow);
    linesByOrder.set(line.purchase_order_id, list);
  });

  const items = (orders || [])
    .map((order) => {
      const row = summarizeHutangFromLines(
        order as {
          id: string;
          po_no: string;
          order_date: string;
          supplier_id: string | null;
          total: number;
          status: string;
          metadata: Record<string, unknown>;
        },
        linesByOrder.get(order.id) || []
      );
      if (!row) return null;
      if (!row.supplierName && order.supplier_id) {
        row.supplierName = supplierMap.get(order.supplier_id) || "";
      }
      return row;
    })
    .filter((row): row is NonNullable<typeof row> => row != null);

  const totalHutang = items.reduce((sum, row) => sum + row.sisaTagihan, 0);

  return NextResponse.json({
    items,
    totalHutang,
    suppliers: suppliers || []
  });
}
