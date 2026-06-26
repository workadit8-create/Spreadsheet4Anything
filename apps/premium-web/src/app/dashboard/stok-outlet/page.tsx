import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchOrgAddons, isAddonEnabled } from "@/lib/org/addons";
import { requireUserOrg } from "@/lib/org/require-user-org";
import { canManageOutletInventory } from "@/lib/outlets/membership-scope";
import StokOutletPageClient from "./StokOutletPageClient";

export default async function StokOutletPage() {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch {
    redirect("/login");
  }

  if (!canManageOutletInventory(auth.role)) {
    redirect("/dashboard");
  }

  const addons = await fetchOrgAddons(supabase, auth.org.id);
  if (!isAddonEnabled(addons, "outlet")) {
    redirect("/dashboard");
  }

  return <StokOutletPageClient role={auth.role} />;
}
