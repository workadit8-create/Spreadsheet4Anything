import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserPrimaryOrg } from "@/lib/org/get-user-org";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const org = await getUserPrimaryOrg(supabase);
  if (!org) return NextResponse.json({ error: "Tidak ada organisasi" }, { status: 400 });

  const { id } = await params;

  const { data: header, error: headerErr } = await supabase
    .from("purchase_requests")
    .select(
      "id, pr_no, request_date, status, total, keterangan, project_code, converted_po_no, supplier_id, suppliers(name)"
    )
    .eq("id", id)
    .eq("organization_id", org.id)
    .maybeSingle();

  if (headerErr) return NextResponse.json({ error: headerErr.message }, { status: 500 });
  if (!header) return NextResponse.json({ error: "Purchase Request tidak ditemukan" }, { status: 404 });

  const { data: lines, error: lineErr } = await supabase
    .from("purchase_request_lines")
    .select(
      "id, purchase_category_id, description, qty, unit_code, unit_cost, diskon, line_total, sort_order"
    )
    .eq("purchase_request_id", id)
    .order("sort_order");

  if (lineErr) return NextResponse.json({ error: lineErr.message }, { status: 500 });

  const sup = header.suppliers as { name: string } | { name: string }[] | null;
  const supplierName = Array.isArray(sup) ? sup[0]?.name : sup?.name;

  return NextResponse.json({
    purchaseRequest: {
      id: header.id,
      prNo: header.pr_no,
      requestDate: header.request_date,
      status: header.status,
      total: Number(header.total) || 0,
      keterangan: header.keterangan || "",
      projectCode: header.project_code || "",
      convertedPoNo: header.converted_po_no || "",
      supplierId: header.supplier_id,
      supplierName: supplierName || ""
    },
    lines: (lines || []).map((l) => ({
      id: l.id,
      purchaseCategoryId: l.purchase_category_id,
      description: l.description,
      qty: Number(l.qty),
      unitCode: l.unit_code || "PCS",
      unitCost: Number(l.unit_cost),
      diskon: Number(l.diskon) || 0,
      lineTotal: Number(l.line_total)
    }))
  });
}
