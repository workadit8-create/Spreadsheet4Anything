import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAddon } from "@/lib/org/addons";
import { requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import { wibTodayIso } from "@/lib/date/wib";
import { generateStockTransferNo } from "@/lib/posting/ids";
import {
  executeStockTransfer,
  validateStockTransferWarehouses
} from "@/lib/inventory/stock-transfer";
import { canManageOutletInventory } from "@/lib/outlets/membership-scope";

export async function GET(request: Request) {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
    await requireAddon(supabase, auth.org.id, "inventory");
    await requireAddon(supabase, auth.org.id, "multi_warehouse");
  } catch (e) {
    return toOrgAuthResponse(e);
  }

  const url = new URL(request.url);
  const start = url.searchParams.get("start") || "";
  const end = url.searchParams.get("end") || "";

  let query = supabase
    .from("stock_transfers")
    .select(
      "id, transfer_no, transfer_date, outlet_code, status, notes, from_warehouse_id, to_warehouse_id, stock_transfer_lines(qty)"
    )
    .eq("organization_id", auth.org.id)
    .order("transfer_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (start) query = query.gte("transfer_date", start);
  if (end) query = query.lte("transfer_date", end);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const warehouseIds = [
    ...new Set(
      (data || []).flatMap((r) => [r.from_warehouse_id, r.to_warehouse_id].filter(Boolean))
    )
  ];

  const { data: warehouses } = warehouseIds.length
    ? await supabase
        .from("warehouses")
        .select("id, code, name")
        .in("id", warehouseIds)
    : { data: [] };

  const whMap = new Map((warehouses || []).map((w) => [w.id, w]));

  const items = (data || []).map((row) => {
    const lines = row.stock_transfer_lines as Array<{ qty: number }> | null;
    const totalQty = (lines || []).reduce((s, l) => s + (Number(l.qty) || 0), 0);
    const fromWh = whMap.get(row.from_warehouse_id);
    const toWh = whMap.get(row.to_warehouse_id);
    return {
      id: row.id,
      transferNo: row.transfer_no,
      transferDate: row.transfer_date,
      outletCode: row.outlet_code,
      status: row.status,
      notes: row.notes,
      fromWarehouse: fromWh ? `${fromWh.code} — ${fromWh.name}` : "—",
      toWarehouse: toWh ? `${toWh.code} — ${toWh.name}` : "—",
      lineCount: lines?.length || 0,
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
    await requireAddon(supabase, auth.org.id, "inventory");
    await requireAddon(supabase, auth.org.id, "multi_warehouse");
  } catch (e) {
    return toOrgAuthResponse(e);
  }

  if (!canManageOutletInventory(auth.role)) {
    return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
  }

  const body = await request.json();
  const transferDate = String(body.transfer_date || body.transferDate || wibTodayIso()).slice(0, 10);
  const fromWarehouseId = String(body.from_warehouse_id || body.fromWarehouseId || "").trim();
  const toWarehouseId = String(body.to_warehouse_id || body.toWarehouseId || "").trim();
  const notes = String(body.notes || "").trim() || null;
  const rawLines = Array.isArray(body.lines) ? body.lines : [];

  if (!fromWarehouseId || !toWarehouseId) {
    return NextResponse.json({ error: "Gudang asal dan tujuan wajib" }, { status: 400 });
  }

  const lines = rawLines
    .map((l: Record<string, unknown>) => ({
      productId: String(l.product_id || l.productId || "").trim(),
      qty: Number(l.qty) || 0
    }))
    .filter((l: { productId: string; qty: number }) => l.productId && l.qty > 0);

  if (!lines.length) {
    return NextResponse.json({ error: "Minimal satu baris produk dengan qty > 0" }, { status: 400 });
  }

  try {
    const validation = await validateStockTransferWarehouses(
      supabase,
      auth.org.id,
      fromWarehouseId,
      toWarehouseId
    );

    const transferNo = generateStockTransferNo();

    const { data: header, error: headerErr } = await supabase
      .from("stock_transfers")
      .insert({
        organization_id: auth.org.id,
        transfer_no: transferNo,
        transfer_date: transferDate,
        from_warehouse_id: fromWarehouseId,
        to_warehouse_id: toWarehouseId,
        outlet_code: validation.outletCode,
        status: "POSTED",
        notes,
        created_by: auth.user.id
      })
      .select("id")
      .single();

    if (headerErr || !header) {
      return NextResponse.json({ error: headerErr?.message || "Gagal buat transfer" }, { status: 500 });
    }

    const lineRows = lines.map((l: { productId: string; qty: number }, i: number) => ({
      transfer_id: header.id,
      product_id: l.productId,
      qty: l.qty,
      sort_order: i
    }));

    const { error: lineErr } = await supabase.from("stock_transfer_lines").insert(lineRows);
    if (lineErr) {
      await supabase.from("stock_transfers").delete().eq("id", header.id);
      return NextResponse.json({ error: lineErr.message }, { status: 400 });
    }

    let result;
    try {
      result = await executeStockTransfer(supabase, {
        organizationId: auth.org.id,
        transferId: header.id,
        transferNo,
        fromWarehouseId,
        toWarehouseId,
        lines,
        createdBy: auth.user.id,
        notes: notes || undefined
      });
    } catch (transferErr) {
      await supabase.from("stock_transfer_lines").delete().eq("transfer_id", header.id);
      await supabase.from("stock_transfers").delete().eq("id", header.id);
      throw transferErr;
    }

    return NextResponse.json({
      ok: true,
      id: header.id,
      transferNo,
      message: `Transfer ${transferNo} tersimpan (${result.lineCount} produk)`
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Gagal transfer stok" },
      { status: 400 }
    );
  }
}
