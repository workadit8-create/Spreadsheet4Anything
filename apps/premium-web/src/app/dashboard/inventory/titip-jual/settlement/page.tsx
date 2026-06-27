import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchOrgAddons, isAddonEnabled } from "@/lib/org/addons";
import { requireUserOrg } from "@/lib/org/require-user-org";
import { PageHeader } from "@/components/ui/PageHeader";
import { ConsignmentSettlementPageClient } from "./ConsignmentSettlementPageClient";
import { ConsignmentPageShell } from "@/components/inventory/consignment-layout";

export default async function ConsignmentSettlementPage() {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch {
    redirect("/login");
  }

  const addons = await fetchOrgAddons(supabase, auth.org.id);
  if (!isAddonEnabled(addons, "titip_jual") || !isAddonEnabled(addons, "inventory")) {
    redirect("/dashboard");
  }

  return (
    <ConsignmentPageShell>
      <PageHeader
        title="Pelunasan & Retur Titip"
        description="Bayar supplier untuk barang laku, atau kembalikan barang titip yang belum terjual"
      />
      <ConsignmentSettlementPageClient />
    </ConsignmentPageShell>
  );
}
