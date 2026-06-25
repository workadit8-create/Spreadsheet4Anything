import type { SupabaseClient } from "@supabase/supabase-js";
import { coaRowsToInsert } from "./default-coa";

/**
 * Isi COA default UMKM jika belum ada (idempotent per nama akun).
 * Dipanggil saat client pertama buka Master COA / Laporan.
 */
export async function ensureDefaultCoa(
  supabase: SupabaseClient,
  organizationId: string
): Promise<{ inserted: number }> {
  const { data: rpcCount, error: rpcError } = await supabase.rpc("seed_default_coa_for_org", {
    p_org_id: organizationId
  });

  if (!rpcError && typeof rpcCount === "number") {
    return { inserted: rpcCount };
  }

  const { data: existing, error: readError } = await supabase
    .from("coa_accounts")
    .select("name, code")
    .eq("organization_id", organizationId);

  if (readError) throw new Error(readError.message);

  const existingNames = new Set((existing || []).map((r: { name: string }) => r.name));
  const existingCodes = new Set((existing || []).map((r: { code: string }) => r.code));
  const toInsert = coaRowsToInsert(organizationId, existingNames, existingCodes);
  if (!toInsert.length) return { inserted: 0 };

  const { error: insertError } = await supabase.from("coa_accounts").insert(toInsert);
  if (insertError) throw new Error(insertError.message);

  return { inserted: toInsert.length };
}
