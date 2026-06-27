import type { SupabaseClient } from "@supabase/supabase-js";
import {
  consignmentStockLinesFromProducts,
  hasConsignmentReturnVoidMovement,
  restoreConsignmentStockAfterReturnVoid
} from "@/lib/inventory/consignment-return";

export async function voidConsignmentReturn(
  supabase: SupabaseClient,
  returnId: string,
  userId: string,
  reason?: string
): Promise<void> {
  const { data: header, error: headerErr } = await supabase
    .from("consignment_returns")
    .select("id, organization_id, return_no, status, warehouse_id, supplier_id")
    .eq("id", returnId)
    .single();

  if (headerErr || !header) {
    throw new Error(headerErr?.message || "Retur titip tidak ditemukan");
  }

  if (header.status === "VOIDED") {
    throw new Error("Retur titip sudah dibatalkan");
  }
  if (header.status !== "POSTED") {
    throw new Error("Hanya retur POSTED yang bisa dibatalkan");
  }

  const alreadyVoid = await hasConsignmentReturnVoidMovement(
    supabase,
    header.organization_id,
    header.id
  );
  if (alreadyVoid) {
    throw new Error("Stok void retur titip sudah pernah diproses");
  }

  const { data: lineRows, error: lineErr } = await supabase
    .from("consignment_return_lines")
    .select("product_id, qty")
    .eq("return_id", returnId)
    .order("sort_order");

  if (lineErr) throw new Error(lineErr.message);
  if (!lineRows?.length) throw new Error("Retur tidak punya baris produk");

  const stockLines = await consignmentStockLinesFromProducts(
    supabase,
    header.organization_id,
    header.supplier_id,
    lineRows.map((l) => ({ product_id: String(l.product_id), qty: Number(l.qty) || 0 }))
  );

  await restoreConsignmentStockAfterReturnVoid(supabase, {
    organizationId: header.organization_id,
    warehouseId: String(header.warehouse_id),
    returnId: header.id,
    returnNo: header.return_no,
    lines: stockLines,
    createdBy: userId,
    notes: reason ? `Void retur titip: ${reason}` : "Void retur titip"
  });

  const { error: updErr } = await supabase
    .from("consignment_returns")
    .update({
      status: "VOIDED",
      voided_at: new Date().toISOString(),
      void_reason: reason?.trim() || null,
      voided_by: userId
    })
    .eq("id", header.id);

  if (updErr) throw new Error(updErr.message);
}
