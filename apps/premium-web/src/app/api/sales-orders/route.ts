import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateOrderNo, generateTransactionId } from "@/lib/posting/ids";
import type { PaymentStatus } from "@/lib/posting/types";

type CreateBody = {
  keterangan?: string;
  total: number;
  bayar?: number;
  paymentStatus?: PaymentStatus;
  rekening?: string;
  akunPendapatan?: string;
  organizationId?: string;
};

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: orders, error } = await supabase
    .from("sales_orders")
    .select("id, order_no, order_date, total, status, metadata, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ids = (orders || []).map((o) => o.id);
  const { data: jobs } = ids.length
    ? await supabase
        .from("posting_jobs")
        .select("id, doc_id, status, last_error, engine_ref, attempts, updated_at")
        .eq("doc_type", "SALES_ORDER")
        .in("doc_id", ids)
    : { data: [] };

  const jobsByDoc = new Map((jobs || []).map((j) => [j.doc_id, j]));

  return NextResponse.json({
    orders: (orders || []).map((o) => ({
      ...o,
      postingJob: jobsByDoc.get(o.id) || null
    }))
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as CreateBody;
  const total = Number(body.total);
  if (!total || total <= 0) {
    return NextResponse.json({ error: "total harus > 0" }, { status: 400 });
  }

  const paymentStatus: PaymentStatus =
    body.paymentStatus === "PENJUALAN KREDIT" ? "PENJUALAN KREDIT" : "PENJUALAN TUNAI";
  const bayar =
    paymentStatus === "PENJUALAN TUNAI"
      ? Number(body.bayar ?? total)
      : Number(body.bayar ?? 0);
  const rekening = String(body.rekening || (paymentStatus === "PENJUALAN TUNAI" ? "Kas" : "")).trim();
  const keterangan = String(body.keterangan || "Penjualan Premium Web").trim();

  let organizationId = body.organizationId;
  if (!organizationId) {
    const { data: orgs, error: orgErr } = await supabase.rpc("get_my_organizations");
    if (orgErr || !orgs?.length) {
      return NextResponse.json({ error: orgErr?.message || "Tidak ada organisasi" }, { status: 400 });
    }
    organizationId = orgs[0].id;
  }

  const { data: warehouse } = await supabase
    .from("warehouses")
    .select("id")
    .eq("organization_id", organizationId)
    .order("is_default", { ascending: false })
    .limit(1)
    .maybeSingle();

  const orderNo = generateOrderNo();
  const transactionId = generateTransactionId();
  const orderDate = new Date().toISOString().slice(0, 10);

  const metadata = {
    transactionId,
    bayar,
    rekening,
    akunPendapatan: String(body.akunPendapatan || "Pendapatan"),
    paymentStatus,
    tanggalBayar: orderDate,
    keterangan
  };

  const { data: order, error: orderErr } = await supabase
    .from("sales_orders")
    .insert({
      organization_id: organizationId,
      warehouse_id: warehouse?.id ?? null,
      order_no: orderNo,
      source_system: "PREMIUM_WEB",
      status: "CONFIRMED",
      order_date: orderDate,
      subtotal: total,
      total,
      metadata
    })
    .select("id, order_no, total, status")
    .single();

  if (orderErr || !order) {
    return NextResponse.json({ error: orderErr?.message || "Gagal buat order" }, { status: 500 });
  }

  const { error: lineErr } = await supabase.from("sales_lines").insert({
    sales_order_id: order.id,
    description: keterangan,
    qty: 1,
    unit_price: total,
    line_total: total,
    sort_order: 0
  });

  if (lineErr) {
    await supabase.from("sales_orders").delete().eq("id", order.id);
    return NextResponse.json({ error: lineErr.message }, { status: 500 });
  }

  const { data: existingJob } = await supabase
    .from("posting_jobs")
    .select("id, status")
    .eq("doc_type", "SALES_ORDER")
    .eq("doc_id", order.id)
    .in("status", ["PENDING", "RUNNING", "POSTED"])
    .maybeSingle();

  let jobId: string | null = existingJob?.id ?? null;

  if (!existingJob) {
    const { data: job, error: jobErr } = await supabase
      .from("posting_jobs")
      .insert({
        organization_id: organizationId,
        doc_type: "SALES_ORDER",
        doc_id: order.id,
        status: "PENDING"
      })
      .select("id, status")
      .single();

    if (jobErr || !job) {
      return NextResponse.json({ error: jobErr?.message || "Gagal enqueue posting job" }, { status: 500 });
    }
    jobId = job.id;
  }

  return NextResponse.json({
    order,
    transactionId,
    postingJobId: jobId,
    message: "Invoice dibuat + posting job PENDING"
  });
}
