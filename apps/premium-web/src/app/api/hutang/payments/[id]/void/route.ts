import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { voidUtangPayment } from "@/lib/posting/void-utang-payment";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: paymentId } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let reason = "";
  try {
    const body = await request.json().catch(() => ({}));
    reason = String(body?.reason || "").trim();
  } catch {
    /* empty */
  }

  try {
    const { reversedEntries } = await voidUtangPayment(
      supabase,
      paymentId,
      user.id,
      reason
    );
    return NextResponse.json({
      ok: true,
      reversedEntries,
      message:
        reversedEntries > 0
          ? `Pelunasan dibatalkan — ${reversedEntries} jurnal pembalik`
          : "Pelunasan dibatalkan"
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}
