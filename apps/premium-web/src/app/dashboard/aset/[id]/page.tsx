import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { summarizeAsset } from "@/lib/assets/depreciation";
import type { FixedAssetRow } from "@/lib/assets/types";
import { requireUserOrg } from "@/lib/org/require-user-org";
import AssetDetailPageClient from "./AssetDetailPageClient";

type PageProps = { params: Promise<{ id: string }> };

export default async function AssetDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch {
    redirect("/login");
  }

  const { data: asset, error } = await supabase
    .from("fixed_assets")
    .select("*")
    .eq("organization_id", auth.org.id)
    .eq("id", id)
    .maybeSingle();

  if (error || !asset) {
    redirect("/dashboard/aset");
  }

  const { data: logs } = await supabase
    .from("asset_depreciation_logs")
    .select("amount, period_date")
    .eq("organization_id", auth.org.id)
    .eq("fixed_asset_id", id)
    .order("period_date", { ascending: false });

  const row = asset as FixedAssetRow;
  const summary = summarizeAsset(
    Number(row.acquisition_cost),
    Number(row.salvage_value),
    row.useful_life_months,
    logs || []
  );

  const { data: orgRow } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", auth.org.id)
    .single();

  return (
    <AssetDetailPageClient
      asset={{
        id: row.id,
        code: row.code,
        name: row.name,
        category: row.category,
        acquisitionDate: row.acquisition_date,
        acquisitionCost: Number(row.acquisition_cost),
        status: row.status,
        notes: row.notes,
        ...summary,
        depreciationCount: (logs || []).length
      }}
      companyName={orgRow?.name || auth.org.name || ""}
    />
  );
}
