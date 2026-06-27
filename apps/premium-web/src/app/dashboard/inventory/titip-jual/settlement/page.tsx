import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchOrgAddons, isAddonEnabled } from "@/lib/org/addons";
import { requireUserOrg } from "@/lib/org/require-user-org";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { ConsignmentSettlementForm } from "@/components/inventory/ConsignmentSettlementForm";

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
    <div>
      <PageHeader
        title="Pelunasan Titip Jual"
        description="Bayar supplier untuk barang titip yang sudah terjual di POS"
      />
      <Card className="p-4">
        <ConsignmentSettlementForm />
      </Card>
    </div>
  );
}
