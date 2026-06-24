import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deleteConfirmedPiutangPayment } from "@/lib/posting/void-piutang-payment";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: paymentId } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await deleteConfirmedPiutangPayment(supabase, paymentId);
    return NextResponse.json({ ok: true, message: "Pelunasan dihapus" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
