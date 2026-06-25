import { NextResponse } from "next/server";
import { wibMonthStartIso, wibMonthStartMonthsAgoIso, wibTodayIso } from "@/lib/date/wib";
import { createClient } from "@/lib/supabase/server";
import { requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import { computeSaldoByAccountName, type KasBankAccount } from "@/lib/posting/mutasi";
import { summarizePiutangFromLines } from "@/lib/posting/piutang";
import { summarizeHutangFromLines } from "@/lib/posting/hutang";
import type { PurchaseLineRow, SalesLineRow } from "@/lib/posting/types";
import { buildBalanceMix, buildMonthlyTrend } from "@/lib/dashboard/chart-data";

function monthRange() {
  return {
    start: wibMonthStartIso(),
    end: wibTodayIso()
  };
}

function trendRange() {
  return {
    start: wibMonthStartMonthsAgoIso(5),
    end: wibTodayIso()
  };
}

export async function GET() {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch (e) {
    return toOrgAuthResponse(e);
  }
  const { user, org } = auth;

  const { start, end } = monthRange();
  const trend = trendRange();

  const [
    salesMonthRes,
    purchaseMonthRes,
    salesOpenRes,
    purchaseOpenRes,
    salesPiutangRes,
    purchaseHutangRes,
    kasAccountsRes,
    transfersRes,
    recentSalesRes,
    recentPurchaseRes,
    salesTrendRes,
    purchaseTrendRes
  ] = await Promise.all([
    supabase
      .from("sales_orders")
      .select("total")
      .eq("organization_id", org.id)
      .eq("status", "POSTED")
      .gte("order_date", start)
      .lte("order_date", end),
    supabase
      .from("purchase_orders")
      .select("total")
      .eq("organization_id", org.id)
      .eq("status", "POSTED")
      .gte("order_date", start)
      .lte("order_date", end),
    supabase
      .from("sales_orders")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.id)
      .eq("status", "CONFIRMED"),
    supabase
      .from("purchase_orders")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.id)
      .eq("status", "CONFIRMED"),
    supabase
      .from("sales_orders")
      .select("id, order_no, order_date, total, customer_id, metadata, status")
      .eq("organization_id", org.id)
      .in("status", ["CONFIRMED", "POSTED"])
      .order("order_date", { ascending: false })
      .limit(80),
    supabase
      .from("purchase_orders")
      .select("id, po_no, order_date, total, supplier_id, metadata, status")
      .eq("organization_id", org.id)
      .in("status", ["CONFIRMED", "POSTED"])
      .order("order_date", { ascending: false })
      .limit(80),
    supabase
      .from("cash_bank_accounts")
      .select("id, name, coa_account_name")
      .eq("organization_id", org.id)
      .eq("active", true),
    supabase
      .from("cash_transfers")
      .select("kind, amount, source_account_name, dest_account_name, status, metadata")
      .eq("organization_id", org.id),
    supabase
      .from("sales_orders")
      .select("id, order_no, order_date, total, status, metadata")
      .eq("organization_id", org.id)
      .neq("status", "DRAFT")
      .order("order_date", { ascending: false })
      .limit(5),
    supabase
      .from("purchase_orders")
      .select("id, po_no, order_date, total, status, metadata")
      .eq("organization_id", org.id)
      .neq("status", "DRAFT")
      .order("order_date", { ascending: false })
      .limit(5),
    supabase
      .from("sales_orders")
      .select("order_date, total")
      .eq("organization_id", org.id)
      .eq("status", "POSTED")
      .gte("order_date", trend.start)
      .lte("order_date", trend.end),
    supabase
      .from("purchase_orders")
      .select("order_date, total")
      .eq("organization_id", org.id)
      .eq("status", "POSTED")
      .gte("order_date", trend.start)
      .lte("order_date", trend.end)
  ]);

  const salesOrderIds = (salesPiutangRes.data || []).map((o) => o.id);
  const purchaseOrderIds = (purchaseHutangRes.data || []).map((o) => o.id);

  const [salesLinesRes, purchaseLinesRes] = await Promise.all([
    salesOrderIds.length
      ? supabase.from("sales_lines").select("*").in("sales_order_id", salesOrderIds)
      : Promise.resolve({ data: [] as SalesLineRow[] }),
    purchaseOrderIds.length
      ? supabase.from("purchase_lines").select("*").in("purchase_order_id", purchaseOrderIds)
      : Promise.resolve({ data: [] as PurchaseLineRow[] })
  ]);

  const salesLinesByOrder = new Map<string, SalesLineRow[]>();
  for (const line of salesLinesRes.data || []) {
    const bucket = salesLinesByOrder.get(line.sales_order_id) || [];
    bucket.push(line as SalesLineRow);
    salesLinesByOrder.set(line.sales_order_id, bucket);
  }

  const purchaseLinesByOrder = new Map<string, PurchaseLineRow[]>();
  for (const line of purchaseLinesRes.data || []) {
    const bucket = purchaseLinesByOrder.get(line.purchase_order_id) || [];
    bucket.push(line as PurchaseLineRow);
    purchaseLinesByOrder.set(line.purchase_order_id, bucket);
  }

  let totalPiutang = 0;
  for (const order of salesPiutangRes.data || []) {
    const row = summarizePiutangFromLines(
      order as {
        id: string;
        order_no: string;
        order_date: string;
        customer_id: string | null;
        total: number;
        status: string;
        metadata: Record<string, unknown>;
      },
      salesLinesByOrder.get(order.id) || []
    );
    if (row) totalPiutang += row.sisaTagihan;
  }

  let totalHutang = 0;
  for (const order of purchaseHutangRes.data || []) {
    const lines = purchaseLinesByOrder.get(order.id) || [];
    const hutang = summarizeHutangFromLines(
      order as {
        id: string;
        po_no: string;
        order_date: string;
        supplier_id: string | null;
        total: number;
        metadata: Record<string, unknown>;
      },
      lines
    );
    if (hutang && order.status !== "VOIDED") {
      totalHutang += hutang.sisaTagihan;
    }
  }

  const kasAccounts = (kasAccountsRes.data || []) as KasBankAccount[];
  const saldoMap = computeSaldoByAccountName(kasAccounts, (transfersRes.data || []) as never[]);
  const totalKasSaldo = Object.values(saldoMap).reduce((sum, n) => sum + (Number(n) || 0), 0);

  const penjualanBulanIni = (salesMonthRes.data || []).reduce(
    (sum, o) => sum + (Number(o.total) || 0),
    0
  );
  const pembelianBulanIni = (purchaseMonthRes.data || []).reduce(
    (sum, o) => sum + (Number(o.total) || 0),
    0
  );

  const monthlyTrend = buildMonthlyTrend(salesTrendRes.data || [], purchaseTrendRes.data || []);
  const balanceMix = buildBalanceMix({
    saldoByAccount: saldoMap,
    totalPiutang
  });

  return NextResponse.json({
    org: { id: org.id, name: org.name, slug: org.slug },
    period: { start, end },
    penjualanBulanIni,
    pembelianBulanIni,
    totalPiutang,
    totalHutang,
    totalKasSaldo,
    saldoByAccount: saldoMap,
    monthlyTrend,
    balanceMix,
    pendingPost: {
      invoices: salesOpenRes.count ?? 0,
      purchaseOrders: purchaseOpenRes.count ?? 0
    },
    recentSales: (recentSalesRes.data || []).map((o) => {
      const meta = (o.metadata || {}) as Record<string, unknown>;
      return {
        id: o.id,
        docNo: o.order_no,
        date: o.order_date,
        total: Number(o.total) || 0,
        status: o.status,
        label: String(meta.customerName || "")
      };
    }),
    recentPurchases: (recentPurchaseRes.data || []).map((o) => {
      const meta = (o.metadata || {}) as Record<string, unknown>;
      return {
        id: o.id,
        docNo: o.po_no,
        date: o.order_date,
        total: Number(o.total) || 0,
        status: o.status,
        label: String(meta.supplierName || "")
      };
    })
  });
}
