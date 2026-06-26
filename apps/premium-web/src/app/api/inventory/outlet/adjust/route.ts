import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAddon } from "@/lib/org/addons";
import { requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import { applyOutletStockOpname } from "@/lib/inventory/adjust-stock";
import {
  assertInventoryOutletAllowed,
  canManageOutletInventory,
  fetchUserInventoryOutletCodes
} from "@/lib/outlets/membership-scope";
import { normalizeOutletCode } from "@/lib/outlets/helpers";

export async function POST(request: Request) {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch (e) {
    return toOrgAuthResponse(e);
  }

  if (!canManageOutletInventory(auth.role)) {
    return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
  }

  try {
    await requireAddon(supabase, auth.org.id, "inventory");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Add-on Multi Outlet tidak aktif" },
      { status: 403 }
    );
  }

  const body = await request.json();
  const outletCode = normalizeOutletCode(body.outlet_code || body.outletCode);
  const notes = String(body.notes || body.keterangan || "Opname stok outlet").trim();
  const lines = Array.isArray(body.lines) ? body.lines : [];

  if (!outletCode) {
    return NextResponse.json({ error: "Outlet wajib dipilih" }, { status: 400 });
  }

  try {
    const allowedCodes = await fetchUserInventoryOutletCodes(supabase, auth.org.id, auth.role);
    assertInventoryOutletAllowed(allowedCodes, outletCode);

    const { data: outlet, error: outletErr } = await supabase
      .from("outlets")
      .select("warehouse_id")
      .eq("organization_id", auth.org.id)
      .eq("outlet_code", outletCode)
      .eq("active", true)
      .maybeSingle();

    if (outletErr) return NextResponse.json({ error: outletErr.message }, { status: 500 });
    if (!outlet?.warehouse_id) {
      return NextResponse.json({ error: "Gudang outlet tidak ditemukan" }, { status: 400 });
    }

    const parsedLines = lines
      .map((line: { product_id?: string; productId?: string; qty_after?: number; qtyAfter?: number }) => ({
        productId: String(line.product_id || line.productId || "").trim(),
        qtyAfter: Number(line.qty_after ?? line.qtyAfter)
      }))
      .filter((l: { productId: string }) => l.productId);

    const result = await applyOutletStockOpname(supabase, {
      organizationId: auth.org.id,
      warehouseId: outlet.warehouse_id,
      outletCode,
      notes,
      lines: parsedLines,
      createdBy: auth.user.id
    });

    return NextResponse.json({
      ok: true,
      ...result,
      message: `${result.adjustedCount} produk disesuaikan`
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal menyimpan opname" },
      { status: 400 }
    );
  }
}
