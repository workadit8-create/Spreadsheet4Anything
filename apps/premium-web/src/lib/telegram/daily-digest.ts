import type { SupabaseClient } from "@supabase/supabase-js";
import { addDaysIso, wibTodayIso } from "@/lib/date/wib";

export type DailyDigestStats = {
  date: string;
  salesCount: number;
  salesTotal: number;
  salesUnposted: number;
  purchaseCount: number;
  purchaseTotal: number;
  purchaseUnposted: number;
  piutangPaymentCount: number;
  piutangPaymentTotal: number;
  piutangNewCount: number;
  piutangNewTotal: number;
  hutangPaymentCount: number;
  hutangPaymentTotal: number;
  hutangNewCount: number;
  hutangNewTotal: number;
};

const OPERATIONAL_STATUSES = ["CONFIRMED", "POSTED"] as const;

export async function fetchDailyDigestStats(
  supabase: SupabaseClient,
  organizationId: string,
  dateIso = wibTodayIso()
): Promise<DailyDigestStats> {
  const nextDay = addDaysIso(dateIso, 1);
  const dayStart = `${dateIso}T00:00:00+07:00`;
  const dayEnd = `${nextDay}T00:00:00+07:00`;

  const [salesRes, purchaseRes, piutangPayRes, hutangPayRes] = await Promise.all([
    supabase
      .from("sales_orders")
      .select("total, status, metadata")
      .eq("organization_id", organizationId)
      .in("status", [...OPERATIONAL_STATUSES])
      .eq("order_date", dateIso),
    supabase
      .from("purchase_orders")
      .select("total, status, metadata")
      .eq("organization_id", organizationId)
      .in("status", [...OPERATIONAL_STATUSES])
      .eq("order_date", dateIso),
    supabase
      .from("payments")
      .select("amount")
      .eq("organization_id", organizationId)
      .eq("doc_type", "PIUTANG_PAYMENT")
      .in("status", [...OPERATIONAL_STATUSES])
      .gte("paid_at", dayStart)
      .lt("paid_at", dayEnd),
    supabase
      .from("payments")
      .select("amount")
      .eq("organization_id", organizationId)
      .eq("doc_type", "UTANG_PAYMENT")
      .in("status", [...OPERATIONAL_STATUSES])
      .gte("paid_at", dayStart)
      .lt("paid_at", dayEnd)
  ]);

  const sales = salesRes.data || [];
  const purchases = purchaseRes.data || [];

  let piutangNewCount = 0;
  let piutangNewTotal = 0;
  for (const row of sales) {
    const meta = (row.metadata || {}) as Record<string, unknown>;
    const paymentStatus = String(meta.paymentStatus || "");
    const total = Number(row.total) || 0;
    const bayar = Number(meta.bayar) || 0;
    const isCredit =
      paymentStatus === "PENJUALAN KREDIT" || (total > 0 && bayar < total - 0.01);
    if (isCredit) {
      piutangNewCount += 1;
      piutangNewTotal += Math.max(0, total - bayar);
    }
  }

  let hutangNewCount = 0;
  let hutangNewTotal = 0;
  for (const row of purchases) {
    const meta = (row.metadata || {}) as Record<string, unknown>;
    const paymentStatus = String(meta.paymentStatus || "");
    const total = Number(row.total) || 0;
    const bayar = Number(meta.bayar) || 0;
    const isCredit =
      paymentStatus === "Kredit" || paymentStatus === "Cicilan" || (total > 0 && bayar < total - 0.01);
    if (isCredit) {
      hutangNewCount += 1;
      hutangNewTotal += Math.max(0, total - bayar);
    }
  }

  const piutangPayments = piutangPayRes.data || [];
  const hutangPayments = hutangPayRes.data || [];

  return {
    date: dateIso,
    salesCount: sales.length,
    salesTotal: sales.reduce((s, r) => s + (Number(r.total) || 0), 0),
    salesUnposted: sales.filter((r) => r.status === "CONFIRMED").length,
    purchaseCount: purchases.length,
    purchaseTotal: purchases.reduce((s, r) => s + (Number(r.total) || 0), 0),
    purchaseUnposted: purchases.filter((r) => r.status === "CONFIRMED").length,
    piutangPaymentCount: piutangPayments.length,
    piutangPaymentTotal: piutangPayments.reduce((s, r) => s + (Number(r.amount) || 0), 0),
    piutangNewCount,
    piutangNewTotal,
    hutangPaymentCount: hutangPayments.length,
    hutangPaymentTotal: hutangPayments.reduce((s, r) => s + (Number(r.amount) || 0), 0),
    hutangNewCount,
    hutangNewTotal
  };
}
