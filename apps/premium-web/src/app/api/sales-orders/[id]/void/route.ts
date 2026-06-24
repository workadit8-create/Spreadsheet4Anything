import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { voidSalesOrder } from "@/lib/posting/void-sales-order";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: orderId } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let reason = "";
  try {
    const body = await request.json().catch(() => ({}));
    reason = String(body?.reason || "").trim();
  } catch {
    /* empty */
  }

  try {
    const { reversedEntries } = await voidSalesOrder(supabase, orderId, user.id, reason);
    return NextResponse.json({
      ok: true,
      reversedEntries,
      message:
        reversedEntries > 0
          ? `Invoice dibatalkan — ${reversedEntries} jurnal pembalik dibuat`
          : "Invoice dibatalkan"
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
