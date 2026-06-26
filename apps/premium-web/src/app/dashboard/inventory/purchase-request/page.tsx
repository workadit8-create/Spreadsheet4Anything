import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchOrgAddons, isAddonEnabled } from "@/lib/org/addons";
import { requireUserOrg } from "@/lib/org/require-user-org";
import { InventoryPlaceholderPage } from "@/components/inventory/InventoryPlaceholderPage";

export default async function PurchaseRequestInventoryPage() {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch {
    redirect("/login");
  }

  const addons = await fetchOrgAddons(supabase, auth.org.id);
  if (!isAddonEnabled(addons, "pembelian")) {
    redirect("/dashboard");
  }

  return (
    <InventoryPlaceholderPage
      badge="Pembelian · Inventory"
      title="Permintaan Pembelian"
      description="PR untuk barang inventory — konversi ke PO setelah disetujui."
    />
  );
}
