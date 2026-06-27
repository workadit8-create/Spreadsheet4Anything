import type { AddonKey } from "@/lib/org/addons-catalog";
import type { NavKey } from "@/lib/org/roles";

export type SidebarNavItem = {
  key: NavKey;
  href: string;
  label: string;
  /** Semua add-on wajib aktif */
  requireAddons?: AddonKey[];
};

export type SidebarGroup = {
  id: string;
  label: string;
  items: SidebarNavItem[];
};

/** Item tunggal di luar grup (Dashboard, Proyek, dll.) */
export type SidebarStandalone = SidebarNavItem & { id: string };

export const SIDEBAR_STANDALONE_TOP: SidebarStandalone[] = [
  { id: "dashboard", key: "dashboard", href: "/dashboard", label: "Dashboard" }
];

export const SIDEBAR_GROUPS: SidebarGroup[] = [
  {
    id: "penjualan",
    label: "Penjualan",
    items: [
      { key: "penjualan", href: "/dashboard/penjualan", label: "Penjualan" },
      { key: "quotation", href: "/dashboard/quotation", label: "Quotation" },
      { key: "penjualan-riwayat", href: "/dashboard/penjualan/riwayat", label: "Riwayat Invoice" },
      { key: "piutang", href: "/dashboard/piutang", label: "Piutang" },
      { key: "pos", href: "/dashboard/pos", label: "Kasir", requireAddons: ["pos"] }
    ]
  },
  {
    id: "expense",
    label: "Expense",
    items: [
      { key: "pembelian", href: "/dashboard/pembelian", label: "Expense" },
      { key: "purchase-request", href: "/dashboard/purchase-request", label: "PRE" },
      { key: "pembelian-riwayat", href: "/dashboard/pembelian/riwayat", label: "Riwayat Expense" }
    ]
  },
  {
    id: "pembelian-inventory",
    label: "Pembelian",
    items: [
      {
        key: "pembelian-inventory",
        href: "/dashboard/inventory/pembelian",
        label: "Purchase Order",
        requireAddons: ["pembelian"]
      },
      {
        key: "purchase-request-inventory",
        href: "/dashboard/inventory/purchase-request",
        label: "Permintaan Pembelian",
        requireAddons: ["pembelian"]
      },
      {
        key: "pembelian-inventory-riwayat",
        href: "/dashboard/inventory/pembelian/riwayat",
        label: "Riwayat PO",
        requireAddons: ["pembelian"]
      }
    ]
  },
  {
    id: "management-inventory",
    label: "Management Inventory",
    items: [
      {
        key: "inventory-suppliers",
        href: "/dashboard/inventory/suppliers",
        label: "Supplier",
        requireAddons: ["inventory"]
      },
      {
        key: "inventory-product-categories",
        href: "/dashboard/inventory/product-categories",
        label: "Kategori Produk",
        requireAddons: ["inventory"]
      },
      {
        key: "inventory-products",
        href: "/dashboard/inventory/products",
        label: "Produk",
        requireAddons: ["inventory"]
      },
      {
        key: "inventory-warehouse",
        href: "/dashboard/inventory/warehouse",
        label: "Warehouse",
        requireAddons: ["inventory"]
      },
      {
        key: "inventory-outlets",
        href: "/dashboard/inventory/outlets",
        label: "Outlet / Cabang",
        requireAddons: ["inventory", "outlet"]
      },
      {
        key: "stok-outlet",
        href: "/dashboard/stok-outlet",
        label: "Stock Opname",
        requireAddons: ["inventory"]
      },
      {
        key: "inventory-transfer",
        href: "/dashboard/inventory/transfer",
        label: "Stock Transfer",
        requireAddons: ["inventory"]
      },
      {
        key: "inventory-return",
        href: "/dashboard/inventory/return",
        label: "Stock Return",
        requireAddons: ["inventory"]
      },
      {
        key: "inventory-stock-report",
        href: "/dashboard/laporan",
        label: "Laporan Stok",
        requireAddons: ["inventory"]
      }
    ]
  },
  {
    id: "titip-jual",
    label: "Titip Jual",
    items: [
      {
        key: "titip-jual-penerimaan",
        href: "/dashboard/inventory/titip-jual/penerimaan",
        label: "Penerimaan Titip",
        requireAddons: ["titip_jual", "inventory"]
      },
      {
        key: "titip-jual-settlement",
        href: "/dashboard/inventory/titip-jual/settlement",
        label: "Pelunasan Titip",
        requireAddons: ["titip_jual", "inventory"]
      },
      {
        key: "titip-jual-riwayat",
        href: "/dashboard/inventory/titip-jual/riwayat",
        label: "Riwayat Titip",
        requireAddons: ["titip_jual", "inventory"]
      }
    ]
  },
  {
    id: "akuntansi",
    label: "Akuntansi",
    items: [
      { key: "hutang", href: "/dashboard/hutang", label: "Hutang" },
      { key: "kas-bank", href: "/dashboard/kas-bank", label: "Kas & Bank" },
      { key: "jurnal", href: "/dashboard/jurnal", label: "Jurnal" },
      { key: "jurnal-manual", href: "/dashboard/jurnal/manual", label: "Jurnal Manual" },
      { key: "laporan", href: "/dashboard/laporan", label: "Laporan" },
      { key: "tax", href: "/dashboard/tax", label: "Pajak" },
      { key: "aset", href: "/dashboard/aset", label: "Aset Tetap" }
    ]
  },
  {
    id: "master",
    label: "Master · Finance",
    items: [{ key: "master", href: "/dashboard/master", label: "Master Data" }]
  }
];

export const SIDEBAR_STANDALONE_BOTTOM: SidebarStandalone[] = [
  { id: "proyek", key: "proyek", href: "/dashboard/proyek", label: "Proyek", requireAddons: ["project"] },
  { id: "tim", key: "tim", href: "/dashboard/tim", label: "Tim & Akses" },
  { id: "audit-log", key: "audit-log", href: "/dashboard/audit-log", label: "Log Audit" },
  { id: "akun", key: "akun", href: "/dashboard/akun", label: "Akun" }
];

export function sidebarItemVisible(
  item: SidebarNavItem,
  addonMap: Record<AddonKey, boolean>
): boolean {
  if (!item.requireAddons?.length) return true;
  return item.requireAddons.every((key) => addonMap[key] === true);
}

export function isSidebarHrefActive(pathname: string, href: string): boolean {
  const pathOnly = href.split("?")[0];
  if (pathname === pathOnly) return true;
  if (pathOnly === "/dashboard") return false;
  const exactOnly = [
    "/dashboard/penjualan",
    "/dashboard/pembelian",
    "/dashboard/inventory/pembelian"
  ];
  if (exactOnly.includes(pathOnly)) {
    return pathname === pathOnly;
  }
  return pathname.startsWith(`${pathOnly}/`);
}
