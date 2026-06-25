import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserPrimaryOrg } from "@/lib/org/get-user-org";
import { generateQuotationNo } from "@/lib/posting/ids";
import { computeLineTotal } from "@/lib/posting/invoice-lines";

type LineInput = {
  product_id: string;
  qty?: number;
  unit_price?: number;
  diskon?: number;
};

type CreateBody = {
  customer_id: string;
  quotation_date?: string;
  keterangan?: string;
  project_code?: string;
  lines: LineInput[];
};

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const org = await getUserPrimaryOrg(supabase);
  if (!org) return NextResponse.json({ error: "Tidak ada organisasi" }, { status: 400 });

  const url = new URL(request.url);
  const activeOnly = url.searchParams.get("active") === "1";
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");

  let query = supabase
    .from("quotations")
    .select(
      "id, quotation_no, quotation_date, status, total, keterangan, converted_order_no, customer_id, customers(name)"
    )
    .eq("organization_id", org.id)
    .order("quotation_date", { ascending: false })
    .limit(100);

  if (activeOnly) query = query.eq("status", "AKTIF");
  if (start) query = query.gte("quotation_date", start);
  if (end) query = query.lte("quotation_date", end);

  const { data: rows, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    rows: (rows || []).map((r) => {
      const cust = r.customers as { name: string } | { name: string }[] | null;
      const customerName = Array.isArray(cust) ? cust[0]?.name : cust?.name;
      return {
        id: r.id,
        quotationNo: r.quotation_no,
        quotationDate: r.quotation_date,
        status: r.status,
        total: Number(r.total) || 0,
        keterangan: r.keterangan || "",
        convertedOrderNo: r.converted_order_no || "",
        customerId: r.customer_id,
        customerName: customerName || ""
      };
    })
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const org = await getUserPrimaryOrg(supabase);
  if (!org) return NextResponse.json({ error: "Tidak ada organisasi" }, { status: 400 });

  const body = (await request.json()) as CreateBody;

  try {
    const customerId = String(body.customer_id || "").trim();
    if (!customerId) {
      return NextResponse.json({ error: "Customer wajib" }, { status: 400 });
    }
    if (!Array.isArray(body.lines) || !body.lines.length) {
      return NextResponse.json({ error: "Minimal satu baris produk" }, { status: 400 });
    }

    const { data: customer, error: custErr } = await supabase
      .from("customers")
      .select("id, name")
      .eq("id", customerId)
      .eq("organization_id", org.id)
      .single();

    if (custErr || !customer) {
      return NextResponse.json({ error: "Customer tidak ditemukan" }, { status: 400 });
    }

    const productIds = body.lines.map((l) => l.product_id);
    const { data: products, error: prodErr } = await supabase
      .from("products")
      .select("id, name, sell_price, units(code)")
      .eq("organization_id", org.id)
      .in("id", productIds);

    if (prodErr) return NextResponse.json({ error: prodErr.message }, { status: 500 });

    const productMap = new Map((products || []).map((p) => [p.id, p]));
    const resolvedLines: Array<{
      product_id: string;
      description: string;
      qty: number;
      unit_code: string;
      unit_price: number;
      diskon: number;
      line_total: number;
      sort_order: number;
    }> = [];

    for (let index = 0; index < body.lines.length; index++) {
      const line = body.lines[index];
      const product = productMap.get(line.product_id);
      if (!product) {
        return NextResponse.json({ error: "Produk tidak ditemukan" }, { status: 400 });
      }
      const qty = Number(line.qty) || 1;
      const unitPrice = line.unit_price != null ? Number(line.unit_price) : Number(product.sell_price);
      const diskon = Number(line.diskon) || 0;
      const lineTotal = computeLineTotal(qty, unitPrice, diskon);
      const rawUnit = product.units as { code: string } | { code: string }[] | null;
      const unit = Array.isArray(rawUnit) ? rawUnit[0] : rawUnit;

      resolvedLines.push({
        product_id: product.id,
        description: product.name,
        qty,
        unit_code: unit?.code || "PCS",
        unit_price: unitPrice,
        diskon,
        line_total: lineTotal,
        sort_order: index
      });
    }

    const total = resolvedLines.reduce((sum, l) => sum + l.line_total, 0);
    if (total <= 0) {
      return NextResponse.json({ error: "Total quotation harus > 0" }, { status: 400 });
    }

    const quotationDate = body.quotation_date || new Date().toISOString().slice(0, 10);
    const quotationNo = generateQuotationNo();

    const { data: header, error: headerErr } = await supabase
      .from("quotations")
      .insert({
        organization_id: org.id,
        quotation_no: quotationNo,
        customer_id: customer.id,
        quotation_date: quotationDate,
        status: "AKTIF",
        keterangan: String(body.keterangan || "").trim() || null,
        project_code: String(body.project_code || "").trim() || null,
        total,
        metadata: { customerName: customer.name }
      })
      .select("id, quotation_no, total, status")
      .single();

    if (headerErr || !header) {
      return NextResponse.json({ error: headerErr?.message || "Gagal simpan quotation" }, { status: 500 });
    }

    const { error: lineErr } = await supabase.from("quotation_lines").insert(
      resolvedLines.map((line) => ({
        quotation_id: header.id,
        product_id: line.product_id,
        description: line.description,
        qty: line.qty,
        unit_code: line.unit_code,
        unit_price: line.unit_price,
        diskon: line.diskon,
        line_total: line.line_total,
        sort_order: line.sort_order
      }))
    );

    if (lineErr) {
      await supabase.from("quotations").delete().eq("id", header.id);
      return NextResponse.json({ error: lineErr.message }, { status: 500 });
    }

    return NextResponse.json({
      quotation: header,
      message: `Quotation ${quotationNo} disimpan (AKTIF). Konversi ke invoice dari menu Penjualan.`
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal buat quotation" },
      { status: 400 }
    );
  }
}
