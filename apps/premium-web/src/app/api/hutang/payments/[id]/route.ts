import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deleteConfirmedUtangPayment } from "@/lib/posting/void-utang-payment";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: paymentId } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await deleteConfirmedUtangPayment(supabase, paymentId);
    return NextResponse.json({ ok: true, message: "Pelunasan dihapus" });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}
