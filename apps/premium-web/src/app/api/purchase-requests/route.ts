import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import { generatePrNo } from "@/lib/posting/ids";
import { computePurchaseLineTotal } from "@/lib/posting/purchase-lines";

type LineInput = {
  description: string;
  purchase_category_id: string;
  qty?: number;
  unit_cost?: number;
  diskon?: number;
  unit_code?: string;
};

type CreateBody = {
  supplier_id?: string;
  request_date?: string;
  keterangan?: string;
  project_code?: string;
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
  const { user, org } = auth;

  const url = new URL(request.url);
  const activeOnly = url.searchParams.get("active") === "1";
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");

  let query = supabase
    .from("purchase_requests")
    .select(
      "id, pr_no, request_date, status, total, keterangan, converted_po_no, supplier_id, suppliers(name)"
    )
    .eq("organization_id", org.id)
    .order("request_date", { ascending: false })
    .limit(100);

  if (activeOnly) query = query.eq("status", "AKTIF");
  if (start) query = query.gte("request_date", start);
  if (end) query = query.lte("request_date", end);

  const { data: rows, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    rows: (rows || []).map((r) => {
      const sup = r.suppliers as { name: string } | { name: string }[] | null;
      const supplierName = Array.isArray(sup) ? sup[0]?.name : sup?.name;
      return {
        id: r.id,
        prNo: r.pr_no,
        requestDate: r.request_date,
        status: r.status,
        total: Number(r.total) || 0,
        keterangan: r.keterangan || "",
        convertedPoNo: r.converted_po_no || "",
        supplierId: r.supplier_id,
        supplierName: supplierName || ""
      };
    })
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch (e) {
    return toOrgAuthResponse(e);
  }
  const { org } = auth;

  const body = (await request.json()) as CreateBody;

  try {
    if (!Array.isArray(body.lines) || !body.lines.length) {
      return NextResponse.json({ error: "Minimal satu baris barang" }, { status: 400 });
    }

    const supplierId = String(body.supplier_id || "").trim() || null;
    let supplierName = "";

    if (supplierId) {
      const { data: supplier, error: supErr } = await supabase
        .from("suppliers")
        .select("id, name")
        .eq("id", supplierId)
        .eq("organization_id", org.id)
        .single();

      if (supErr || !supplier) {
        return NextResponse.json({ error: "Supplier tidak ditemukan" }, { status: 400 });
      }
      supplierName = supplier.name;
    }

    const categoryIds = body.lines.map((l) => l.purchase_category_id);
    const { data: categories, error: catErr } = await supabase
      .from("purchase_categories")
      .select("id, category, sub_category")
      .eq("organization_id", org.id)
      .in("id", categoryIds);

    if (catErr) return NextResponse.json({ error: catErr.message }, { status: 500 });

    const catMap = new Map((categories || []).map((c) => [c.id, c]));
    const resolvedLines: Array<{
      purchase_category_id: string;
      description: string;
      qty: number;
      unit_code: string;
      unit_cost: number;
      diskon: number;
      line_total: number;
      sort_order: number;
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
      if (qty <= 0) {
        return NextResponse.json({ error: `Qty baris ${index + 1} harus > 0` }, { status: 400 });
      }

      const unitCost = Number(line.unit_cost) || 0;
      const diskon = Number(line.diskon) || 0;
      const lineTotal = computePurchaseLineTotal(qty, unitCost, diskon);

      resolvedLines.push({
        purchase_category_id: cat.id,
        description,
        qty,
        unit_code: String(line.unit_code || "PCS"),
        unit_cost: unitCost,
        diskon,
        line_total: lineTotal,
        sort_order: index
      });
    }

    const total = resolvedLines.reduce((sum, l) => sum + l.line_total, 0);
    const requestDate = body.request_date || new Date().toISOString().slice(0, 10);
    const prNo = generatePrNo();

    const { data: header, error: headerErr } = await supabase
      .from("purchase_requests")
      .insert({
        organization_id: org.id,
        pr_no: prNo,
        supplier_id: supplierId,
        request_date: requestDate,
        status: "AKTIF",
        keterangan: String(body.keterangan || "").trim() || null,
        project_code: String(body.project_code || "").trim() || null,
        total,
        metadata: supplierName ? { supplierName } : {}
      })
      .select("id, pr_no, total, status")
      .single();

    if (headerErr || !header) {
      return NextResponse.json({ error: headerErr?.message || "Gagal simpan PR" }, { status: 500 });
    }

    const { error: lineErr } = await supabase.from("purchase_request_lines").insert(
      resolvedLines.map((line) => ({
        purchase_request_id: header.id,
        purchase_category_id: line.purchase_category_id,
        description: line.description,
        qty: line.qty,
        unit_code: line.unit_code,
        unit_cost: line.unit_cost,
        diskon: line.diskon,
        line_total: line.line_total,
        sort_order: line.sort_order
      }))
    );

    if (lineErr) {
      await supabase.from("purchase_requests").delete().eq("id", header.id);
      return NextResponse.json({ error: lineErr.message }, { status: 500 });
    }

    return NextResponse.json({
      purchaseRequest: header,
      message: `Purchase Request ${prNo} disimpan (AKTIF). Konversi ke PO dari menu Pembelian.`
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal buat purchase request" },
      { status: 400 }
    );
  }
}
