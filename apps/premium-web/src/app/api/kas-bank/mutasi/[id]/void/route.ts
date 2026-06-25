import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { voidCashTransfer } from "@/lib/posting/void-cash-transfer";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: transferId } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const reason = typeof body.reason === "string" ? body.reason : undefined;

  try {
    const result = await voidCashTransfer(supabase, transferId, user.id, reason);
    return NextResponse.json({
      ok: true,
      reversedEntries: result.reversedEntries,
      message: "Mutasi dibatalkan (void)"
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}
