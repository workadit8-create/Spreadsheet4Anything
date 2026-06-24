import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserPrimaryOrg } from "@/lib/org/get-user-org";
import { summarizePiutangFromLines } from "@/lib/posting/piutang";
import type { SalesLineRow } from "@/lib/posting/types";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const org = await getUserPrimaryOrg(supabase);
  if (!org) return NextResponse.json({ error: "Tidak ada organisasi" }, { status: 400 });

  const url = new URL(request.url);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  const customerId = url.searchParams.get("customer_id");

  const { data: customers } = await supabase
    .from("customers")
    .select("id, code, name")
    .eq("organization_id", org.id)
    .eq("active", true)
    .order("name");

  const customerMap = new Map((customers || []).map((c) => [c.id, c.name]));

  let ordersQuery = supabase
    .from("sales_orders")
    .select("id, order_no, order_date, total, customer_id, metadata, status")
    .eq("organization_id", org.id)
    .in("status", ["CONFIRMED", "POSTED"])
    .order("order_date", { ascending: false });

  if (start) ordersQuery = ordersQuery.gte("order_date", start);
  if (end) ordersQuery = ordersQuery.lte("order_date", end);
  if (customerId) ordersQuery = ordersQuery.eq("customer_id", customerId);

  const { data: orders, error: ordersErr } = await ordersQuery.limit(200);
  if (ordersErr) return NextResponse.json({ error: ordersErr.message }, { status: 500 });

  const orderIds = (orders || []).map((o) => o.id);
  const { data: lines } = orderIds.length
    ? await supabase.from("sales_lines").select("*").in("sales_order_id", orderIds)
    : { data: [] };

  const linesByOrder = new Map<string, SalesLineRow[]>();
  (lines || []).forEach((line) => {
    const list = linesByOrder.get(line.sales_order_id) || [];
    list.push(line as SalesLineRow);
    linesByOrder.set(line.sales_order_id, list);
  });

  const items = (orders || [])
    .map((order) => {
      const row = summarizePiutangFromLines(
        order as {
          id: string;
          order_no: string;
          order_date: string;
          customer_id: string | null;
          total: number;
          metadata: Record<string, unknown>;
        },
        linesByOrder.get(order.id) || []
      );
      if (!row) return null;
      if (!row.customerName && order.customer_id) {
        row.customerName = customerMap.get(order.customer_id) || "";
      }
      return row;
    })
    .filter((row): row is NonNullable<typeof row> => row != null);

  const totalPiutang = items.reduce((sum, row) => sum + row.sisaTagihan, 0);

  return NextResponse.json({
    items,
    totalPiutang,
    customers: customers || []
  });
}
