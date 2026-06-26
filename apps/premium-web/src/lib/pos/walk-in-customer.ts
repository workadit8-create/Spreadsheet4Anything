import type { SupabaseClient } from "@supabase/supabase-js";

const WALKIN_CODE = "WALKIN";

export async function ensureWalkInCustomer(
  supabase: SupabaseClient,
  organizationId: string
): Promise<string> {
  const { data: existing } = await supabase
    .from("customers")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("code", WALKIN_CODE)
    .maybeSingle();

  if (existing?.id) return existing.id;

  const { data: created, error } = await supabase
    .from("customers")
    .insert({
      organization_id: organizationId,
      code: WALKIN_CODE,
      name: "Pelanggan Umum",
      active: true
    })
    .select("id")
    .single();

  if (error || !created) {
    throw new Error(error?.message || "Gagal buat customer walk-in");
  }

  return created.id;
}
