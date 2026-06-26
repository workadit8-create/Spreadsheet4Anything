import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchInventoryProductCatalog } from "@/lib/inventory/fetch-inventory-catalog";
import { requireAddon } from "@/lib/org/addons";
import { requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";

export async function GET(request: Request) {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
    await requireAddon(supabase, auth.org.id, "inventory");
  } catch (e) {
    return toOrgAuthResponse(e);
  }

  const url = new URL(request.url);
  const outletCode = url.searchParams.get("outlet_code") || "";
  const categoryId = url.searchParams.get("category_id") || "";
  const productKind = url.searchParams.get("product_kind") || "";
  const search = url.searchParams.get("search") || "";

  try {
    const data = await fetchInventoryProductCatalog(supabase, auth.org.id, auth.role, {
      outletCode: outletCode || undefined,
      categoryId: categoryId || undefined,
      productKind: productKind || undefined,
      search: search || undefined
    });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal memuat katalog produk" },
      { status: 500 }
    );
  }
}
