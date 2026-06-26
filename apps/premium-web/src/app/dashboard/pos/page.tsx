import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchOrgAddons, isAddonEnabled } from "@/lib/org/addons";
import { requireUserOrg } from "@/lib/org/require-user-org";
import PosPageClient from "./PosPageClient";

export default async function PosPage() {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch {
    redirect("/login");
  }

  const addons = await fetchOrgAddons(supabase, auth.org.id);
  if (!isAddonEnabled(addons, "pos")) {
    redirect("/dashboard");
  }

  return <PosPageClient userEmail={auth.user.email || ""} />;
}
