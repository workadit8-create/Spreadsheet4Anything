import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchOrgAddons, isAddonEnabled } from "@/lib/org/addons";
import { requireUserOrg } from "@/lib/org/require-user-org";
import InventoryMasterPageClient from "../InventoryMasterPageClient";

export default async function InventoryProductCategoriesPage() {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch {
    redirect("/login");
  }

  const addons = await fetchOrgAddons(supabase, auth.org.id);
  if (!isAddonEnabled(addons, "inventory")) {
    redirect("/dashboard/master");
  }

  return <InventoryMasterPageClient tab="product-categories" />;
}
