import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserPrimaryOrg } from "@/lib/org/get-user-org";
import { generatePoNo, generateTransactionId } from "@/lib/posting/ids";
import {
  allocatePaymentAcrossPurchaseLines,
  buildPembelianKeterangan,
  computePurchaseLineTotal,
  deriveOrderPembelianMetode
} from "@/lib/posting/purchase-lines";
import type { PurchaseLineMetadata } from "@/lib/posting/types";

import { summarizeHutangFromLines, lineBayar } from "@/lib/posting/hutang";
import type { PurchaseLineRow } from "@/lib/posting/types";

type LineInput = {
  description: string;
  purchase_category_id: string;
  qty?: number;
  unit_cost?: number;
  diskon?: number;
  unit_code?: string;
};

type CreateBody = {
  supplier_id: string;
  order_date?: string;
  bayar?: number;
  rekening?: string;
  lines: LineInput[];
};

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const org = await getUserPrimaryOrg(supabase);
  if (!org) return NextResponse.json({ error: "Tidak ada organisasi" }, { status: 400 });

  const url = new URL(request.url);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  const supplierId = url.searchParams.get("supplier_id");

  let query = supabase
    .from("purchase_orders")
    .select("id, po_no, order_date, total, status, supplier_id, metadata, created_at")
    .eq("organization_id", org.id)
    .neq("status", "DRAFT")
    .order("order_date", { ascending: false })
    .limit(100);

  if (start) query = query.gte("order_date", start);
  if (end) query = query.lte("order_date", end);
  if (supplierId) query = query.eq("supplier_id", supplierId);

  const { data: orders, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const orderIds = (orders || []).map((o) => o.id);
  const { data: lineRows } = orderIds.length
    ? await supabase.from("purchase_lines").select("*").in("purchase_order_id", orderIds)
    : { data: [] };

  const linesByOrder = new Map<string, PurchaseLineRow[]>();
  for (const line of lineRows || []) {
    const bucket = linesByOrder.get(line.purchase_order_id) || [];
    bucket.push(line as PurchaseLineRow);
    linesByOrder.set(line.purchase_order_id, bucket);
  }

  let grandTotalSum = 0;
  const rows = (orders || []).map((o) => {
    const meta = (o.metadata || {}) as Record<string, unknown>;
    const lines = linesByOrder.get(o.id) || [];
    const hutang = summarizeHutangFromLines(
      o as {
        id: string;
        po_no: string;
        order_date: string;
        supplier_id: string | null;
        total: number;
        metadata: Record<string, unknown>;
      },
      lines
    );
    const grandTotal = lines.reduce((s, l) => s + Number(l.line_total) || 0, 0) || Number(o.total) || 0;
    const sisaTagihan = hutang?.sisaTagihan ?? 0;
    const bayar = lines.reduce((s, l) => s + lineBayar(l), 0) || Number(meta.bayar) || 0;
    grandTotalSum += grandTotal;

    return {
      id: o.id,
      poNo: o.po_no,
      orderDate: o.order_date,
      supplierName: String(meta.supplierName || ""),
      status: o.status,
      grandTotal,
      bayar,
      sisaTagihan
    };
  });

  return NextResponse.json({ rows, grandTotalSum });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const org = await getUserPrimaryOrg(supabase);
  if (!org) return NextResponse.json({ error: "Tidak ada organisasi" }, { status: 400 });

  const body = (await request.json()) as CreateBody;

  try {
    const supplierId = String(body.supplier_id || "").trim();
    if (!supplierId) {
      return NextResponse.json({ error: "Supplier wajib" }, { status: 400 });
    }
    if (!Array.isArray(body.lines) || !body.lines.length) {
      return NextResponse.json({ error: "Minimal satu baris pembelian" }, { status: 400 });
    }

    const { data: supplier, error: supErr } = await supabase
      .from("suppliers")
      .select("id, name")
      .eq("id", supplierId)
      .eq("organization_id", org.id)
      .single();

    if (supErr || !supplier) {
      return NextResponse.json({ error: "Supplier tidak ditemukan" }, { status: 400 });
    }

    const categoryIds = body.lines.map((l) => l.purchase_category_id);
    const { data: categories, error: catErr } = await supabase
      .from("purchase_categories")
      .select("id, category, sub_category, coa_account")
      .eq("organization_id", org.id)
      .in("id", categoryIds);

    if (catErr) return NextResponse.json({ error: catErr.message }, { status: 500 });

    const catMap = new Map((categories || []).map((c) => [c.id, c]));

    const resolvedLines: Array<{
      description: string;
      purchase_category_id: string;
      qty: number;
      unit_cost: number;
      line_total: number;
      sort_order: number;
      unitCode: string;
      akunPembelian: string;
      diskon: number;
    }> = [];

    for (let index = 0; index < body.lines.length; index++) {
      const line = body.lines[index];
      const description = String(line.description || "").trim();
      if (!description) {
        return NextResponse.json({ error: "Nama barang wajib di setiap baris" }, { status: 400 });
      }

      const cat = catMap.get(line.purchase_category_id);
      if (!cat) {
        return NextResponse.json({ error: "Kategori pembelian tidak ditemukan" }, { status: 400 });
      }

      const qty = Number(line.qty) || 1;
      const unitCost = Number(line.unit_cost) || 0;
      const diskon = Number(line.diskon) || 0;
      const lineTotal = computePurchaseLineTotal(qty, unitCost, diskon);

      resolvedLines.push({
        description,
        purchase_category_id: cat.id,
        qty,
        unit_cost: unitCost,
        line_total: lineTotal,
        sort_order: index,
        unitCode: String(line.unit_code || "PCS"),
        akunPembelian: cat.coa_account,
        diskon
      });
    }

    const subtotal = resolvedLines.reduce((sum, l) => sum + l.line_total, 0);
    if (subtotal <= 0) {
      return NextResponse.json({ error: "Total pembelian harus > 0" }, { status: 400 });
    }

    const totalBayar = Math.min(subtotal, Math.max(0, Number(body.bayar ?? subtotal)));
    const paymentSlices = allocatePaymentAcrossPurchaseLines(
      resolvedLines.map((l) => l.line_total),
      totalBayar
    );
    const paymentStatus = deriveOrderPembelianMetode(paymentSlices);
    const rekening = String(body.rekening || (totalBayar > 0 ? "Kas" : "")).trim();
    const orderDate = body.order_date || new Date().toISOString().slice(0, 10);
    const keterangan = buildPembelianKeterangan(
      supplier.name,
      resolvedLines.map((l) => l.description)
    );

    const { data: warehouse } = await supabase
      .from("warehouses")
      .select("id")
      .eq("organization_id", org.id)
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle();

    const poNo = generatePoNo();
    const headerTransactionId = generateTransactionId();

    const metadata = {
      transactionId: headerTransactionId,
      bayar: totalBayar,
      rekening,
      akunPembelian: resolvedLines[0].akunPembelian,
      paymentStatus,
      tanggalBayar: orderDate,
      keterangan,
      supplierId: supplier.id,
      supplierName: supplier.name,
      pembelianMode: "proper"
    };

    const { data: order, error: orderErr } = await supabase
      .from("purchase_orders")
      .insert({
        organization_id: org.id,
        warehouse_id: warehouse?.id ?? null,
        supplier_id: supplier.id,
        po_no: poNo,
        status: "CONFIRMED",
        order_date: orderDate,
        total: subtotal,
        metadata
      })
      .select("id, po_no, total, status")
      .single();

    if (orderErr || !order) {
      return NextResponse.json({ error: orderErr?.message || "Gagal buat PO" }, { status: 500 });
    }

    const lineRows = resolvedLines.map((line, index) => {
      const slice = paymentSlices[index];
      const lineMeta: PurchaseLineMetadata = {
        transactionId: generateTransactionId(),
        akunPembelian: line.akunPembelian,
        diskon: line.diskon,
        unitCode: line.unitCode,
        bayar: slice.bayar,
        kurangBayar: slice.kurangBayar,
        metode: slice.metode,
        tanggalBayar: slice.bayar > 0 ? orderDate : undefined,
        purchaseCategoryId: line.purchase_category_id
      };
      return {
        purchase_order_id: order.id,
        description: line.description,
        qty: line.qty,
        unit_cost: line.unit_cost,
        line_total: line.line_total,
        sort_order: line.sort_order,
        metadata: lineMeta
      };
    });

    const { error: lineErr } = await supabase.from("purchase_lines").insert(lineRows);
    if (lineErr) {
      await supabase.from("purchase_orders").delete().eq("id", order.id);
      return NextResponse.json({ error: lineErr.message }, { status: 500 });
    }

    return NextResponse.json({
      order,
      transactionId: headerTransactionId,
      message: "Pembelian disimpan (CONFIRMED). Posting ke jurnal dari riwayat PO."
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal buat pembelian" },
      { status: 400 }
    );
  }
}
