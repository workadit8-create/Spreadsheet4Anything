import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserPrimaryOrg } from "@/lib/org/get-user-org";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const org = await getUserPrimaryOrg(supabase);
  if (!org) return NextResponse.json({ error: "Tidak ada organisasi" }, { status: 400 });

  const { data: order, error } = await supabase
    .from("purchase_orders")
    .select("id, po_no, order_date, total, status, supplier_id, metadata")
    .eq("id", id)
    .eq("organization_id", org.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!order) return NextResponse.json({ error: "PO tidak ditemukan" }, { status: 404 });

  const { data: lines } = await supabase
    .from("purchase_lines")
    .select("*")
    .eq("purchase_order_id", id)
    .order("sort_order");

  const meta = (order.metadata || {}) as Record<string, unknown>;
  const mappedLines = (lines || []).map((l) => {
    const lm = (l.metadata || {}) as Record<string, unknown>;
    return {
      id: l.id,
      description: l.description,
      qty: Number(l.qty),
      unitCost: Number(l.unit_cost),
      diskon: Number(lm.diskon) || 0,
      lineTotal: Number(l.line_total),
      metode: String(lm.metode || ""),
      akunPembelian: String(lm.akunPembelian || "")
    };
  });

  return NextResponse.json({
    order: {
      id: order.id,
      poNo: order.po_no,
      orderDate: order.order_date,
      supplierName: String(meta.supplierName || ""),
      status: order.status,
      grandTotal: Number(order.total) || 0
    },
    lines: mappedLines,
    isPosted: order.status === "POSTED" || order.status === "VOIDED"
  });
}
