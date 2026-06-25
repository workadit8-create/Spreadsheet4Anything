import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch (e) {
    return toOrgAuthResponse(e);
  }
  const { user, org } = auth;

  const { id } = await params;

  const { data: header, error: headerErr } = await supabase
    .from("quotations")
    .select(
      "id, quotation_no, quotation_date, status, total, keterangan, project_code, converted_order_no, customer_id, customers(name)"
    )
    .eq("id", id)
    .eq("organization_id", org.id)
    .maybeSingle();

  if (headerErr) return NextResponse.json({ error: headerErr.message }, { status: 500 });
  if (!header) return NextResponse.json({ error: "Quotation tidak ditemukan" }, { status: 404 });

  const { data: lines, error: lineErr } = await supabase
    .from("quotation_lines")
    .select("id, product_id, description, qty, unit_code, unit_price, diskon, line_total, sort_order")
    .eq("quotation_id", id)
    .order("sort_order");

  if (lineErr) return NextResponse.json({ error: lineErr.message }, { status: 500 });

  const cust = header.customers as { name: string } | { name: string }[] | null;
  const customerName = Array.isArray(cust) ? cust[0]?.name : cust?.name;

  return NextResponse.json({
    quotation: {
      id: header.id,
      quotationNo: header.quotation_no,
      quotationDate: header.quotation_date,
      status: header.status,
      total: Number(header.total) || 0,
      keterangan: header.keterangan || "",
      projectCode: header.project_code || "",
      convertedOrderNo: header.converted_order_no || "",
      customerId: header.customer_id,
      customerName: customerName || ""
    },
    lines: (lines || []).map((l) => ({
      id: l.id,
      productId: l.product_id,
      description: l.description,
      qty: Number(l.qty),
      unitCode: l.unit_code || "PCS",
      unitPrice: Number(l.unit_price),
      diskon: Number(l.diskon) || 0,
      lineTotal: Number(l.line_total)
    }))
  });
}
