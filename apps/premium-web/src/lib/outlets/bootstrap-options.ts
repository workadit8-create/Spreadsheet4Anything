import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchOrgAddons, isAddonEnabled } from "@/lib/org/addons";
import { OUTLET_PUSAT_CODE, OUTLET_PUSAT_LABEL } from "@/lib/outlets/constants";

export type OutletOption = {
  outletCode: string;
  label: string;
  name: string;
  businessSector: string;
  warehouseId: string | null;
};

export async function fetchOutletBootstrap(supabase: SupabaseClient, orgId: string) {
  const addons = await fetchOrgAddons(supabase, orgId);
  if (!isAddonEnabled(addons, "outlet")) {
    return {
      enabled: false,
      options: [],
      pusat: { outletCode: OUTLET_PUSAT_CODE, label: OUTLET_PUSAT_LABEL }
    };
  }

  const { data, error } = await supabase
    .from("outlets")
    .select("outlet_code, name, business_sector, warehouse_id, sort_order")
    .eq("organization_id", orgId)
    .eq("active", true)
    .order("sort_order")
    .order("name");

  if (error) throw new Error(error.message);

  const options: OutletOption[] = (data || []).map((row) => ({
    outletCode: row.outlet_code,
    label: `${row.outlet_code} — ${row.name}`,
    name: row.name,
    businessSector: row.business_sector,
    warehouseId: row.warehouse_id
  }));

  return {
    enabled: true,
    options,
    pusat: { outletCode: OUTLET_PUSAT_CODE, label: OUTLET_PUSAT_LABEL }
  };
}
