import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchOrgAddons, isAddonEnabled } from "@/lib/org/addons";
import { requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import {
  consignmentStockLinesFromProducts,
  receiveConsignmentStock
} from "@/lib/inventory/consignment-receipt";
import { resolveWarehouseIdForSale } from "@/lib/inventory/sale-stock";
import { generateConsignmentReceiptNo } from "@/lib/posting/ids";
import { resolveOutletCodeForSave } from "@/lib/outlets/helpers";
import { wibDateIsoFromInput, wibTodayIso } from "@/lib/date/wib";
import { parseConsignmentHistoryQuery } from "@/lib/inventory/consignment-history-query";

type LineInput = {
  product_id: string;
  qty?: number;
  unit_settlement?: number;
};

type CreateBody = {
  supplier_id: string;
  receipt_date?: string;
  outlet_code?: string;
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
    .from("consignment_receipts")
    .select(
      "id, receipt_no, receipt_date, status, notes, outlet_code, suppliers(name), consignment_receipt_lines(qty, unit_settlement)"
    )
    .eq("organization_id", org.id)
    .gte("receipt_date", start)
    .lte("receipt_date", end)
    .order("receipt_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (supplierId) {
    query = query.eq("supplier_id", supplierId);
  }

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const items = (data || []).map((row) => {
    const sup = row.suppliers as { name: string } | { name: string }[] | null;
    const supplierName = Array.isArray(sup) ? sup[0]?.name : sup?.name;
    const lines = (row.consignment_receipt_lines || []) as Array<{ qty: number; unit_settlement: number }>;
    const totalQty = lines.reduce((s, l) => s + (Number(l.qty) || 0), 0);
    return {
      id: row.id,
      receiptNo: row.receipt_no,
      receiptDate: row.receipt_date,
      status: row.status,
      notes: row.notes,
      outletCode: row.outlet_code,
      supplierName: supplierName || "—",
      lineCount: lines.length,
      totalQty
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

  const warehouseId = await resolveWarehouseIdForSale(supabase, org.id, { outletCode });
  if (!warehouseId) {
    return NextResponse.json({ error: "Gudang outlet belum dikonfigurasi" }, { status: 400 });
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

  const receiptDate = body.receipt_date ? wibDateIsoFromInput(body.receipt_date) : wibTodayIso();
  const receiptNo = generateConsignmentReceiptNo();

  const normalizedLines = body.lines
    .filter((l) => l.product_id && (Number(l.qty) || 0) > 0)
    .map((l, i) => ({
      product_id: String(l.product_id),
      qty: Number(l.qty) || 0,
      unit_settlement: l.unit_settlement != null ? Number(l.unit_settlement) : undefined,
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
      normalizedLines
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Validasi produk gagal" },
      { status: 400 }
    );
  }

  const { data: receipt, error: receiptErr } = await supabase
    .from("consignment_receipts")
    .insert({
      organization_id: org.id,
      receipt_no: receiptNo,
      receipt_date: receiptDate,
      supplier_id: supplierId,
      warehouse_id: warehouseId,
      outlet_code: outletCode,
      status: "POSTED",
      notes: String(body.notes || "").trim() || null,
      created_by: user.id,
      posted_at: new Date().toISOString()
    })
    .select("id, receipt_no")
    .single();

  if (receiptErr || !receipt) {
    return NextResponse.json({ error: receiptErr?.message || "Gagal buat penerimaan" }, { status: 500 });
  }

  const lineRows = normalizedLines.map((l, i) => {
    const stock = stockLines.find((s) => s.productId === l.product_id);
    return {
      receipt_id: receipt.id,
      product_id: l.product_id,
      qty: l.qty,
      unit_settlement: stock?.unitSettlement ?? 0,
      sort_order: i
    };
  });

  const { error: lineErr } = await supabase.from("consignment_receipt_lines").insert(lineRows);
  if (lineErr) {
    await supabase.from("consignment_receipts").delete().eq("id", receipt.id);
    return NextResponse.json({ error: lineErr.message }, { status: 500 });
  }

  try {
    await receiveConsignmentStock(supabase, {
      organizationId: org.id,
      warehouseId,
      receiptId: receipt.id,
      receiptNo: receipt.receipt_no,
      lines: stockLines,
      createdBy: user.id,
      notes: `Titip jual dari ${supplier.name}`
    });
  } catch (err) {
    await supabase.from("consignment_receipts").delete().eq("id", receipt.id);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal update stok" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    receiptId: receipt.id,
    receiptNo: receipt.receipt_no,
    message: "Penerimaan titip jual berhasil — stok masuk tanpa jurnal PO"
  });
}
