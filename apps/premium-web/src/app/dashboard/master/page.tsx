import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { fetchOrgAddons, isAddonEnabled } from "@/lib/org/addons";
import { requireUserOrg } from "@/lib/org/require-user-org";
import MasterDataClient from "./MasterDataClient";

export default async function MasterDataPage({
  searchParams
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch {
    redirect("/login");
  }

  const addons = await fetchOrgAddons(supabase, auth.org.id);
  const inventoryAddonEnabled = isAddonEnabled(addons, "inventory");

  if (inventoryAddonEnabled && tab) {
    const dest: Record<string, string> = {
      suppliers: "/dashboard/inventory/suppliers",
      "product-categories": "/dashboard/inventory/product-categories",
      products: "/dashboard/inventory/products",
      outlets: "/dashboard/inventory/outlets"
    };
    if (dest[tab]) redirect(dest[tab]);
  }

  return (
    <Suspense fallback={<main className="mx-auto max-w-5xl px-6 py-8 text-sm text-slate-500">Memuat master data…</main>}>
      <MasterDataClient
        role={auth.role}
        outletAddonEnabled={isAddonEnabled(addons, "outlet")}
        inventoryAddonEnabled={inventoryAddonEnabled}
      />
    </Suspense>
  );
}
