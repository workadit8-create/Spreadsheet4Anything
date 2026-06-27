import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchOrgAddons, isAddonEnabled } from "@/lib/org/addons";
import { requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import {
  consignmentStockLinesFromProducts,
  returnConsignmentStock
} from "@/lib/inventory/consignment-return";
import { resolveConsignmentWarehouseId } from "@/lib/inventory/warehouse-resolve";
import { generateConsignmentReturnNo } from "@/lib/posting/ids";
import { resolveOutletCodeForSave } from "@/lib/outlets/helpers";
import { wibDateIsoFromInput, wibTodayIso } from "@/lib/date/wib";
import { parseConsignmentHistoryQuery } from "@/lib/inventory/consignment-history-query";

type LineInput = {
  product_id: string;
  qty?: number;
};

type CreateBody = {
  supplier_id: string;
  return_date?: string;
  outlet_code?: string;
  warehouse_id?: string;
  notes?: string;
  lines: LineInput[];
};

export async function GET(request: Request) {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch (e) {
    return toOrgAuthResponse(e);
  }
  const { org } = auth;

  const addons = await fetchOrgAddons(supabase, org.id);
  if (!isAddonEnabled(addons, "titip_jual") || !isAddonEnabled(addons, "inventory")) {
    return NextResponse.json({ error: "Add-on titip jual tidak aktif" }, { status: 403 });
  }

  const { start, end, supplierId, limit } = parseConsignmentHistoryQuery(request.url);

  let query = supabase
    .from("consignment_returns")
    .select(
      "id, return_no, return_date, status, notes, outlet_code, suppliers(name), consignment_return_lines(qty)"
    )
    .eq("organization_id", org.id)
    .gte("return_date", start)
    .lte("return_date", end)
    .order("return_date", { ascending: false })
    .limit(limit);

  if (supplierId) {
    query = query.eq("supplier_id", supplierId);
  }

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const items = (data || []).map((row) => {
    const sup = row.suppliers as { name: string } | { name: string }[] | null;
    const lines = (row.consignment_return_lines || []) as Array<{ qty: number }>;
    return {
      id: row.id,
      returnNo: row.return_no,
      returnDate: row.return_date,
      supplierName: (Array.isArray(sup) ? sup[0]?.name : sup?.name) || "—",
      outletCode: row.outlet_code,
      status: row.status,
      totalQty: lines.reduce((s, l) => s + (Number(l.qty) || 0), 0),
      lineCount: lines.length
    };
  });

  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch (e) {
    return toOrgAuthResponse(e);
  }
  const { user, org } = auth;

  const addons = await fetchOrgAddons(supabase, org.id);
  if (!isAddonEnabled(addons, "titip_jual") || !isAddonEnabled(addons, "inventory")) {
    return NextResponse.json({ error: "Add-on titip jual tidak aktif" }, { status: 403 });
  }

  const body = (await request.json()) as CreateBody;
  const supplierId = String(body.supplier_id || "").trim();
  if (!supplierId) {
    return NextResponse.json({ error: "Supplier wajib" }, { status: 400 });
  }
  if (!Array.isArray(body.lines) || !body.lines.length) {
    return NextResponse.json({ error: "Minimal satu baris produk" }, { status: 400 });
  }

  let outletCode: string | null;
  try {
    outletCode = await resolveOutletCodeForSave(supabase, org.id, body.outlet_code);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Outlet tidak valid" },
      { status: 400 }
    );
  }

  let warehouseId: string | null;
  try {
    warehouseId = await resolveConsignmentWarehouseId(supabase, org.id, {
      outletCode,
      explicitWarehouseId: body.warehouse_id
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gudang tidak valid" },
      { status: 400 }
    );
  }
  if (!warehouseId) {
    return NextResponse.json({ error: "Gudang penerima belum dikonfigurasi" }, { status: 400 });
  }

  const { data: supplier } = await supabase
    .from("suppliers")
    .select("id, name")
    .eq("id", supplierId)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (!supplier) {
    return NextResponse.json({ error: "Supplier tidak ditemukan" }, { status: 400 });
  }

  const returnDate = body.return_date ? wibDateIsoFromInput(body.return_date) : wibTodayIso();
  const returnNo = generateConsignmentReturnNo();

  const normalizedLines = body.lines
    .filter((l) => l.product_id && (Number(l.qty) || 0) > 0)
    .map((l, i) => ({
      product_id: String(l.product_id),
      qty: Number(l.qty) || 0,
      sort_order: i
    }));

  if (!normalizedLines.length) {
    return NextResponse.json({ error: "Tidak ada baris valid" }, { status: 400 });
  }

  let stockLines;
  try {
    stockLines = await consignmentStockLinesFromProducts(
      supabase,
      org.id,
      supplierId,
      normalizedLines.map((l) => ({ product_id: l.product_id, qty: l.qty }))
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Validasi produk gagal" },
      { status: 400 }
    );
  }

  const { data: ret, error: retErr } = await supabase
    .from("consignment_returns")
    .insert({
      organization_id: org.id,
      return_no: returnNo,
      return_date: returnDate,
      supplier_id: supplierId,
      warehouse_id: warehouseId,
      outlet_code: outletCode,
      status: "POSTED",
      notes: String(body.notes || "").trim() || null,
      created_by: user.id
    })
    .select("id, return_no")
    .single();

  if (retErr || !ret) {
    return NextResponse.json({ error: retErr?.message || "Gagal buat retur" }, { status: 500 });
  }

  const lineRows = normalizedLines.map((l, i) => ({
    return_id: ret.id,
    product_id: l.product_id,
    qty: l.qty,
    sort_order: i
  }));

  const { error: lineErr } = await supabase.from("consignment_return_lines").insert(lineRows);
  if (lineErr) {
    await supabase.from("consignment_returns").delete().eq("id", ret.id);
    return NextResponse.json({ error: lineErr.message }, { status: 500 });
  }

  try {
    await returnConsignmentStock(supabase, {
      organizationId: org.id,
      warehouseId,
      returnId: ret.id,
      returnNo: ret.return_no,
      lines: stockLines,
      createdBy: user.id,
      notes: `Retur titip ke ${supplier.name}`
    });
  } catch (err) {
    await supabase.from("consignment_returns").delete().eq("id", ret.id);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal update stok" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    returnId: ret.id,
    returnNo: ret.return_no,
    message: "Retur barang titip berhasil — stok dikurangi"
  });
}
