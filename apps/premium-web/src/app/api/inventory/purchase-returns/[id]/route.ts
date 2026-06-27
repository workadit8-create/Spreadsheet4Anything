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
  if (!isAddonEnabled(addons, "pembelian") || !isAddonEnabled(addons, "inventory")) {
    return NextResponse.json({ error: "Add-on pembelian inventory tidak aktif" }, { status: 403 });
  }

  const { data: header, error } = await supabase
    .from("purchase_returns")
    .select(
      "id, return_no, return_date, status, total, dpp, tax_amount, refund_mode, rekening, notes, outlet_code, warehouse_id, suppliers(name), purchase_orders(po_no), warehouses(code, name)"
    )
    .eq("id", id)
    .eq("organization_id", org.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!header) return NextResponse.json({ error: "Dokumen tidak ditemukan" }, { status: 404 });

  const { data: lines, error: lineErr } = await supabase
    .from("purchase_return_lines")
    .select("id, qty, unit_cost, line_total, dpp, tax_amount, products(name, sku)")
    .eq("return_id", id)
    .order("sort_order");

  if (lineErr) return NextResponse.json({ error: lineErr.message }, { status: 500 });

  const sup = header.suppliers as { name: string } | { name: string }[] | null;
  const po = header.purchase_orders as { po_no: string } | { po_no: string }[] | null;
  const wh = header.warehouses as
    | { code: string; name: string }
    | { code: string; name: string }[]
    | null;
  const warehouse = Array.isArray(wh) ? wh[0] : wh;

  return NextResponse.json({
    kind: "purchase_return",
    header: {
      id: header.id,
      docNo: header.return_no,
      docDate: header.return_date,
      status: header.status,
      supplierName: (Array.isArray(sup) ? sup[0]?.name : sup?.name) || "—",
      poNo: (Array.isArray(po) ? po[0]?.po_no : po?.po_no) || null,
      total: Number(header.total) || 0,
      dpp: Number(header.dpp) || 0,
      taxAmount: Number(header.tax_amount) || 0,
      refundMode: header.refund_mode,
      rekening: header.rekening,
      outletCode: header.outlet_code,
      notes: header.notes,
      warehouseLabel: warehouse ? `${warehouse.code} — ${warehouse.name}` : null
    },
    lines: (lines || []).map((l) => {
      const prod = l.products as
        | { name: string; sku: string | null }
        | { name: string; sku: string | null }[]
        | null;
      const p = Array.isArray(prod) ? prod[0] : prod;
      return {
        productName: p?.name || "—",
        sku: p?.sku || "",
        qty: Number(l.qty) || 0,
        unitCost: Number(l.unit_cost) || 0,
        lineTotal: Number(l.line_total) || 0,
        dpp: Number(l.dpp) || 0,
        taxAmount: Number(l.tax_amount) || 0
      };
    }),
    hasJournal: true,
    journalSourceType: "PURCHASE_RETURN",
    journalSourceId: header.id
  });
}
