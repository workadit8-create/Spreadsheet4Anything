import type { SupabaseClient } from "@supabase/supabase-js";
import type { MembershipRole } from "@/lib/org/roles";
import { normalizeOutletCode } from "@/lib/outlets/helpers";

export type MembershipOutletScope = {
  outletCode: string;
  canPos: boolean;
  canInventory: boolean;
};

export type PosOutletScopeInfo = {
  /** Kasir dengan scope terbatas */
  restricted: boolean;
  /** Hanya satu outlet — tidak boleh ganti */
  locked: boolean;
  outletCodes: string[];
};

/** null = tidak dibatasi (owner/staff/akuntan). [] = kasir tanpa outlet (invalid). */
export async function fetchUserPosOutletCodes(
  supabase: SupabaseClient,
  orgId: string,
  role: MembershipRole
): Promise<string[] | null> {
  if (role !== "cashier") return null;

  const { data, error } = await supabase.rpc("get_my_outlet_pos_scopes", {
    p_org_id: orgId
  });
  if (error) throw new Error(error.message);

  return (data || [])
    .filter((row: { can_pos?: boolean }) => row.can_pos !== false)
    .map((row: { outlet_code: string }) => normalizeOutletCode(row.outlet_code));
}

export function buildPosOutletScopeInfo(codes: string[] | null): PosOutletScopeInfo {
  if (codes === null) {
    return { restricted: false, locked: false, outletCodes: [] };
  }
  return {
    restricted: true,
    locked: codes.length === 1,
    outletCodes: codes
  };
}

export function assertPosOutletAllowed(
  allowedCodes: string[] | null,
  outletCode: string | null | undefined
): void {
  if (allowedCodes === null) return;

  const code = normalizeOutletCode(outletCode);
  if (!code || code === "PUSAT") {
    throw new Error("Kasir wajib menggunakan outlet yang ditetapkan");
  }
  if (!allowedCodes.includes(code)) {
    throw new Error(`Anda tidak punya akses ke outlet ${code}`);
  }
}

export type InventoryOutletScopeInfo = {
  restricted: boolean;
  locked: boolean;
  outletCodes: string[];
};

/** null = tidak dibatasi. [] = outlet_staff tanpa outlet (invalid). */
export async function fetchUserInventoryOutletCodes(
  supabase: SupabaseClient,
  orgId: string,
  role: MembershipRole
): Promise<string[] | null> {
  if (role !== "outlet_staff") return null;

  const { data, error } = await supabase.rpc("get_my_outlet_inventory_scopes", {
    p_org_id: orgId
  });
  if (error) throw new Error(error.message);

  return (data || [])
    .filter((row: { can_inventory?: boolean }) => row.can_inventory !== false)
    .map((row: { outlet_code: string }) => normalizeOutletCode(row.outlet_code));
}

export function assertInventoryOutletAllowed(
  allowedCodes: string[] | null,
  outletCode: string | null | undefined
): void {
  if (allowedCodes === null) return;

  const code = normalizeOutletCode(outletCode);
  if (!code || code === "PUSAT") {
    throw new Error("Wajib memilih outlet yang ditetapkan");
  }
  if (!allowedCodes.includes(code)) {
    throw new Error(`Anda tidak punya akses stok outlet ${code}`);
  }
}

export function filterOutletOptionsByScope<T extends { outletCode: string }>(
  options: T[],
  allowedCodes: string[] | null
): T[] {
  if (allowedCodes === null) return options;
  const set = new Set(allowedCodes);
  return options.filter((o) => set.has(normalizeOutletCode(o.outletCode)));
}

export function canManageOutletInventory(role: MembershipRole): boolean {
  return role === "owner" || role === "staff" || role === "akuntan" || role === "outlet_staff";
}
