import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchOrgAddons, isAddonEnabled } from "@/lib/org/addons";
import { requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch (e) {
    return toOrgAuthResponse(e);
  }
  const { org } = auth;
  const { id } = await params;

  const addons = await fetchOrgAddons(supabase, org.id);
  if (!isAddonEnabled(addons, "titip_jual")) {
    return NextResponse.json({ error: "Add-on titip jual tidak aktif" }, { status: 403 });
  }

  const { data: header, error } = await supabase
    .from("consignment_settlements")
    .select("id, settlement_no, settlement_date, status, total, rekening, notes, suppliers(name)")
    .eq("id", id)
    .eq("organization_id", org.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!header) return NextResponse.json({ error: "Dokumen tidak ditemukan" }, { status: 404 });

  const { data: liabilities, error: liabErr } = await supabase
    .from("consignment_liabilities")
    .select("qty, unit_settlement, total_amount, products(name), sales_orders(order_no)")
    .eq("settlement_id", id)
    .order("created_at");

  if (liabErr) return NextResponse.json({ error: liabErr.message }, { status: 500 });

  const sup = header.suppliers as { name: string } | { name: string }[] | null;

  return NextResponse.json({
    kind: "settlement",
    header: {
      id: header.id,
      docNo: header.settlement_no,
      docDate: header.settlement_date,
      status: header.status,
      total: Number(header.total) || 0,
      rekening: header.rekening,
      notes: header.notes,
      supplierName: (Array.isArray(sup) ? sup[0]?.name : sup?.name) || "—"
    },
    lines: (liabilities || []).map((l) => {
      const prod = l.products as { name: string } | { name: string }[] | null;
      const so = l.sales_orders as { order_no: string } | { order_no: string }[] | null;
      return {
        orderNo: (Array.isArray(so) ? so[0]?.order_no : so?.order_no) || "—",
        productName: (Array.isArray(prod) ? prod[0]?.name : prod?.name) || "—",
        qty: Number(l.qty) || 0,
        unitSettlement: Number(l.unit_settlement) || 0,
        totalAmount: Number(l.total_amount) || 0
      };
    }),
    hasJournal: true,
    journalSourceType: "CONSIGNMENT_SETTLEMENT",
    journalSourceId: header.id
  });
}
