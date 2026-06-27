import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchOrgAddons, isAddonEnabled } from "@/lib/org/addons";
import { requireUserOrg } from "@/lib/org/require-user-org";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { ConsignmentReceiptForm } from "@/components/inventory/ConsignmentReceiptForm";

export default async function ConsignmentReceiptPage() {
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
        title="Penerimaan Titip Jual"
        description="Barang consignment masuk stok — tanpa PO / tanpa jurnal Persediaan"
      />
      <Card className="p-4">
        <ConsignmentReceiptForm />
      </Card>
    </div>
  );
}
