import type { SupabaseClient } from "@supabase/supabase-js";

export async function assertQuotationConvertible(
  supabase: SupabaseClient,
  quotationId: string,
  organizationId: string
) {
  const { data: qt, error } = await supabase
    .from("quotations")
    .select("id, status, converted_order_no")
    .eq("id", quotationId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!qt) throw new Error("Quotation tidak ditemukan");
  if (qt.status === "CONVERTED") {
    throw new Error(
      `Quotation sudah dikonversi ke invoice ${qt.converted_order_no || ""}`.trim()
    );
  }
}

export async function markQuotationConverted(
  supabase: SupabaseClient,
  quotationId: string,
  organizationId: string,
  salesOrderId: string,
  orderNo: string
) {
  await assertQuotationConvertible(supabase, quotationId, organizationId);

  const { error } = await supabase
    .from("quotations")
    .update({
      status: "CONVERTED",
      sales_order_id: salesOrderId,
      converted_order_no: orderNo,
      updated_at: new Date().toISOString()
    })
    .eq("id", quotationId)
    .eq("organization_id", organizationId);

  if (error) throw new Error(error.message);
}

export async function assertPurchaseRequestConvertible(
  supabase: SupabaseClient,
  purchaseRequestId: string,
  organizationId: string
) {
  const { data: pr, error } = await supabase
    .from("purchase_requests")
    .select("id, status, converted_po_no")
    .eq("id", purchaseRequestId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!pr) throw new Error("PRE tidak ditemukan");
  if (pr.status === "CONVERTED") {
    throw new Error(
      `PRE sudah dikonversi ke Expense ${pr.converted_po_no || ""}`.trim()
    );
  }
}

export async function markPurchaseRequestConverted(
  supabase: SupabaseClient,
  purchaseRequestId: string,
  organizationId: string,
  purchaseOrderId: string,
  poNo: string
) {
  await assertPurchaseRequestConvertible(supabase, purchaseRequestId, organizationId);

  const { error } = await supabase
    .from("purchase_requests")
    .update({
      status: "CONVERTED",
      purchase_order_id: purchaseOrderId,
      converted_po_no: poNo,
      updated_at: new Date().toISOString()
    })
    .eq("id", purchaseRequestId)
    .eq("organization_id", organizationId);

  if (error) throw new Error(error.message);
}
