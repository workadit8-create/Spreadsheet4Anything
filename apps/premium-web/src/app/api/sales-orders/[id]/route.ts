import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deleteConfirmedSalesOrder } from "@/lib/posting/void-sales-order";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: orderId } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await deleteConfirmedSalesOrder(supabase, orderId);
    return NextResponse.json({ ok: true, message: "Invoice dihapus" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
