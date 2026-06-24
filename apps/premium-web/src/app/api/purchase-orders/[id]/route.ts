import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deleteConfirmedPurchaseOrder } from "@/lib/posting/void-purchase-order";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: orderId } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await deleteConfirmedPurchaseOrder(supabase, orderId);
    return NextResponse.json({ ok: true, message: "PO dihapus" });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}
