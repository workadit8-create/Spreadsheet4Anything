import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import { fetchCompanyProfile } from "@/lib/org/company-profile";
import { lineBayar, summarizeHutangFromLines } from "@/lib/posting/hutang";
import type { PurchaseLineRow } from "@/lib/posting/types";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch (e) {
    return toOrgAuthResponse(e);
  }
  const { user, org } = auth;

  const { data: order, error } = await supabase
    .from("purchase_orders")
    .select("id, po_no, order_date, total, status, supplier_id, metadata")
    .eq("id", id)
    .eq("organization_id", org.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!order) return NextResponse.json({ error: "PO tidak ditemukan" }, { status: 404 });

  const { data: lines } = await supabase
    .from("purchase_lines")
    .select("*")
    .eq("purchase_order_id", id)
    .order("sort_order");

  const lineRows = (lines || []) as PurchaseLineRow[];
  const meta = (order.metadata || {}) as Record<string, unknown>;
  const mappedLines = lineRows.map((l) => {
    const lm = (l.metadata || {}) as Record<string, unknown>;
    return {
      id: l.id,
      description: l.description,
      qty: Number(l.qty),
      unitCost: Number(l.unit_cost),
      diskon: Number(lm.diskon) || 0,
      lineTotal: Number(l.line_total),
      metode: String(lm.metode || ""),
      akunPembelian: String(lm.akunPembelian || "")
    };
  });

  const grandTotal =
    lineRows.reduce((s, l) => s + Number(l.line_total) || 0, 0) || Number(order.total) || 0;
  const hutang = summarizeHutangFromLines(
    order as {
      id: string;
      po_no: string;
      order_date: string;
      supplier_id: string | null;
      total: number;
      status: string;
      metadata: Record<string, unknown>;
    },
    lineRows
  );
  const isVoided = order.status === "VOIDED";
  const bayar = lineRows.reduce((s, l) => s + lineBayar(l), 0) || Number(meta.bayar) || 0;
  const sisaTagihan = isVoided ? 0 : (hutang?.sisaTagihan ?? 0);

  const company = await fetchCompanyProfile(supabase, org);

  return NextResponse.json({
    order: {
      id: order.id,
      poNo: order.po_no,
      orderDate: order.order_date,
      supplierName: String(meta.supplierName || ""),
      status: order.status,
      grandTotal,
      bayar: isVoided ? 0 : bayar,
      sisaTagihan
    },
    lines: mappedLines,
    isPosted: order.status === "POSTED" || order.status === "VOIDED",
    company: {
      name: company.name,
      address: company.address,
      phone: company.phone,
      logoUrl: company.logoUrl
    }
  });
}
