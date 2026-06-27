import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAddon } from "@/lib/org/addons";
import { requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
    await requireAddon(supabase, auth.org.id, "inventory");
    await requireAddon(supabase, auth.org.id, "multi_warehouse");
  } catch (e) {
    return toOrgAuthResponse(e);
  }

  const { id } = await params;

  const { data: header, error } = await supabase
    .from("stock_transfers")
    .select(
      "id, transfer_no, transfer_date, outlet_code, status, notes, from_warehouse_id, to_warehouse_id"
    )
    .eq("id", id)
    .eq("organization_id", auth.org.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!header) return NextResponse.json({ error: "Dokumen tidak ditemukan" }, { status: 404 });

  const { data: lines, error: lineErr } = await supabase
    .from("stock_transfer_lines")
    .select("id, qty, products(name, sku)")
    .eq("transfer_id", id)
    .order("sort_order");

  if (lineErr) return NextResponse.json({ error: lineErr.message }, { status: 500 });

  const whIds = [header.from_warehouse_id, header.to_warehouse_id];
  const { data: warehouses } = await supabase
    .from("warehouses")
    .select("id, code, name")
    .in("id", whIds);

  const whMap = new Map((warehouses || []).map((w) => [w.id, w]));
  const fromWh = whMap.get(header.from_warehouse_id);
  const toWh = whMap.get(header.to_warehouse_id);

  return NextResponse.json({
    header: {
      docNo: header.transfer_no,
      docDate: header.transfer_date,
      status: header.status,
      outletCode: header.outlet_code,
      notes: header.notes,
      fromWarehouse: fromWh ? `${fromWh.code} — ${fromWh.name}` : "—",
      toWarehouse: toWh ? `${toWh.code} — ${toWh.name}` : "—"
    },
    lines: (lines || []).map((l) => {
      const prod = l.products as { name: string; sku: string | null } | { name: string; sku: string | null }[] | null;
      const p = Array.isArray(prod) ? prod[0] : prod;
      return {
        productName: p?.name || "—",
        sku: p?.sku || "",
        qty: Number(l.qty) || 0
      };
    })
  });
}
