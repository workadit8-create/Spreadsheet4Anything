import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deleteConfirmedCashTransfer } from "@/lib/posting/void-cash-transfer";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: transferId } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await deleteConfirmedCashTransfer(supabase, transferId);
    return NextResponse.json({ ok: true, message: "Mutasi dihapus" });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}
