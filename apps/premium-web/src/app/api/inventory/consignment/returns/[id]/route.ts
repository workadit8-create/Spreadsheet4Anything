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
    .from("consignment_returns")
    .select("id, return_no, return_date, status, notes, outlet_code, suppliers(name)")
    .eq("id", id)
    .eq("organization_id", org.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!header) return NextResponse.json({ error: "Dokumen tidak ditemukan" }, { status: 404 });

  const { data: lines, error: lineErr } = await supabase
    .from("consignment_return_lines")
    .select("id, qty, sort_order, products(name, sku)")
    .eq("return_id", id)
    .order("sort_order");

  if (lineErr) return NextResponse.json({ error: lineErr.message }, { status: 500 });

  const sup = header.suppliers as { name: string } | { name: string }[] | null;

  return NextResponse.json({
    kind: "return",
    header: {
      id: header.id,
      docNo: header.return_no,
      docDate: header.return_date,
      status: header.status,
      notes: header.notes,
      outletCode: header.outlet_code,
      supplierName: (Array.isArray(sup) ? sup[0]?.name : sup?.name) || "—"
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
        qty: Number(l.qty) || 0
      };
    }),
    hasJournal: false,
    journalHint:
      "Retur barang titip tidak membuat jurnal — hanya pergerakan stok keluar (CONSIGNMENT_RETURN)."
  });
}
