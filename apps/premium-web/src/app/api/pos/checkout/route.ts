import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAddon } from "@/lib/org/addons";
import { requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import { processPosCheckout, type PosCheckoutInput } from "@/lib/pos/checkout";

export async function POST(request: Request) {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch (e) {
    return toOrgAuthResponse(e);
  }

  try {
    await requireAddon(supabase, auth.org.id, "pos");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Add-on POS tidak aktif" },
      { status: 403 }
    );
  }

  const body = (await request.json()) as PosCheckoutInput;

  try {
    const result = await processPosCheckout(
      supabase,
      auth.org.id,
      auth.user?.id ?? null,
      body
    );
    return NextResponse.json({
      ok: true,
      ...result,
      message: result.posted
        ? `Transaksi ${result.orderNo} selesai & jurnal terposting`
        : `Transaksi ${result.orderNo} tersimpan — jurnal menunggu posting`
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Checkout gagal" },
      { status: 400 }
    );
  }
}
