import type { AddonKey } from "@/lib/org/addons-catalog";

export const MEMBERSHIP_ROLES = ["owner", "staff", "akuntan", "cashier"] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

export const NAV_KEYS = [
  "dashboard",
  "master",
  "penjualan",
  "quotation",
  "penjualan-riwayat",
  "piutang",
  "pembelian",
  "purchase-request",
  "pembelian-riwayat",
  "hutang",
  "kas-bank",
  "jurnal",
  "jurnal-manual",
  "laporan",
  "tax",
  "aset",
  "proyek",
  "pos",
  "tim",
  "audit-log",
  "akun"
] as const;
export type NavKey = (typeof NAV_KEYS)[number];

/** null = semua menu (owner). Port dari GAS hybrid Config.js */
export const ROLE_MENU_KEYS: Record<MembershipRole, readonly NavKey[] | null> = {
  owner: null,
  staff: [
    "dashboard",
    "master",
    "quotation",
    "penjualan",
    "penjualan-riwayat",
    "pos",
    "piutang",
    "purchase-request",
    "pembelian",
    "pembelian-riwayat",
    "hutang",
    "kas-bank",
    "tax",
    "aset",
    "proyek",
    "pos",
    "akun"
  ],
  akuntan: [
    "dashboard",
    "master",
    "piutang",
    "hutang",
    "kas-bank",
    "jurnal",
    "jurnal-manual",
    "laporan",
    "tax",
    "aset",
    "proyek",
    "audit-log",
    "akun"
  ],
  cashier: ["dashboard", "pos", "akun"]
};

export const ROLE_LABELS: Record<MembershipRole, string> = {
  owner: "Owner",
  staff: "Staff",
  akuntan: "Akuntan",
  cashier: "Kasir"
};

export function normalizeMembershipRole(value: string | null | undefined): MembershipRole {
  const r = String(value || "").trim().toLowerCase();
  if ((MEMBERSHIP_ROLES as readonly string[]).includes(r)) return r as MembershipRole;
  return "staff";
}

export function isNavKeyAllowed(role: MembershipRole, key: NavKey): boolean {
  const allowed = ROLE_MENU_KEYS[role];
  if (allowed === null) return true;
  return allowed.includes(key);
}

const PATH_NAV_KEY: Array<{ prefix: string; key: NavKey }> = [
  { prefix: "/dashboard/jurnal/manual", key: "jurnal-manual" },
  { prefix: "/dashboard/jurnal", key: "jurnal" },
  { prefix: "/dashboard/laporan", key: "laporan" },
  { prefix: "/dashboard/tax", key: "tax" },
  { prefix: "/dashboard/ppn", key: "tax" },
  { prefix: "/dashboard/aset", key: "aset" },
  { prefix: "/dashboard/penjualan/riwayat", key: "penjualan-riwayat" },
  { prefix: "/dashboard/penjualan", key: "penjualan" },
  { prefix: "/dashboard/quotation", key: "quotation" },
  { prefix: "/dashboard/piutang", key: "piutang" },
  { prefix: "/dashboard/purchase-request", key: "purchase-request" },
  { prefix: "/dashboard/pembelian/riwayat", key: "pembelian-riwayat" },
  { prefix: "/dashboard/pembelian", key: "pembelian" },
  { prefix: "/dashboard/hutang", key: "hutang" },
  { prefix: "/dashboard/kas-bank", key: "kas-bank" },
  { prefix: "/dashboard/master", key: "master" },
  { prefix: "/dashboard/proyek", key: "proyek" },
  { prefix: "/dashboard/pos", key: "pos" },
  { prefix: "/dashboard/tim", key: "tim" },
  { prefix: "/dashboard/audit-log", key: "audit-log" },
  { prefix: "/dashboard/akun", key: "akun" },
  { prefix: "/dashboard", key: "dashboard" }
];

export function navKeyForPath(pathname: string): NavKey {
  for (const row of PATH_NAV_KEY) {
    if (pathname === row.prefix || pathname.startsWith(`${row.prefix}/`)) {
      return row.key;
    }
  }
  return "dashboard";
}

export function canAccessDashboardPath(role: MembershipRole, pathname: string): boolean {
  if (!pathname.startsWith("/dashboard")) return true;
  const key = navKeyForPath(pathname);
  return isNavKeyAllowed(role, key);
}

/** Posting jurnal & void — owner + akuntan */
export const POSTING_ROLES: MembershipRole[] = ["owner", "akuntan"];

export function canPostJournal(role: MembershipRole): boolean {
  return POSTING_ROLES.includes(role);
}

/** Master kas & bank, profil usaha, logo — owner saja */
export const OWNER_ONLY_ROLES: MembershipRole[] = ["owner"];

export type MasterEntityKey =
  | "customer"
  | "product"
  | "supplier"
  | "kasBank"
  | "purchaseCategory"
  | "coa"
  | "outlet";

export const MASTER_ENTITY_ROLES: Record<MasterEntityKey, MembershipRole[]> = {
  customer: ["owner", "staff", "akuntan"],
  product: ["owner", "staff", "akuntan"],
  supplier: ["owner", "staff", "akuntan"],
  kasBank: ["owner"],
  purchaseCategory: ["owner", "akuntan"],
  coa: ["owner", "akuntan"],
  outlet: ["owner", "staff", "akuntan"]
};

export function canEditMasterEntity(role: MembershipRole, entity: MasterEntityKey): boolean {
  return MASTER_ENTITY_ROLES[entity].includes(role);
}

export type MasterTabId =
  | "customers"
  | "product-categories"
  | "products"
  | "units"
  | "coa"
  | "kas-bank"
  | "suppliers"
  | "purchase-categories"
  | "outlets";

export const MASTER_TAB_ENTITY: Record<MasterTabId, MasterEntityKey> = {
  customers: "customer",
  "product-categories": "product",
  products: "product",
  units: "product",
  coa: "coa",
  "kas-bank": "kasBank",
  suppliers: "supplier",
  "purchase-categories": "purchaseCategory",
  outlets: "outlet"
};

export const MASTER_TAB_LABELS: Record<MasterTabId, string> = {
  customers: "Customer",
  "product-categories": "Kategori Produk",
  products: "Produk",
  units: "Satuan",
  coa: "COA",
  "kas-bank": "Kas & Bank",
  suppliers: "Supplier",
  "purchase-categories": "Kategori Pembelian",
  outlets: "Outlet / Cabang"
};

export function canAccessMasterTab(role: MembershipRole, tabId: MasterTabId): boolean {
  return canEditMasterEntity(role, MASTER_TAB_ENTITY[tabId]);
}

export function masterTabsForRole(role: MembershipRole): MasterTabId[] {
  return (Object.keys(MASTER_TAB_ENTITY) as MasterTabId[]).filter((tabId) =>
    canAccessMasterTab(role, tabId)
  );
}

export function addonNavKey(addon: AddonKey): NavKey | null {
  if (addon === "project") return "proyek";
  if (addon === "pos") return "pos";
  return null;
}
