import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchOrgAddons, isAddonEnabled } from "@/lib/org/addons";
import { requireUserOrg } from "@/lib/org/require-user-org";
import RiwayatPembelianClient from "@/app/dashboard/pembelian/riwayat/RiwayatPembelianClient";

export default async function PembelianInventoryRiwayatPage() {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch {
    redirect("/login");
  }

  const addons = await fetchOrgAddons(supabase, auth.org.id);
  if (!isAddonEnabled(addons, "pembelian") || !isAddonEnabled(addons, "inventory")) {
    redirect("/dashboard");
  }

  return <RiwayatPembelianClient role={auth.role} mode="inventory" />;
}
