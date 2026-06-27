export const ADDON_KEYS = ["project", "pos", "outlet", "inventory", "pembelian", "titip_jual", "multi_warehouse", "pos_gramasi", "crm"] as const;
export type AddonKey = (typeof ADDON_KEYS)[number];

export type AddonInfo = {
  key: AddonKey;
  label: string;
  description: string;
  enabled: boolean;
};

export const ADDON_CATALOG: Record<
  AddonKey,
  { label: string; description: string; navHref?: string }
> = {
  project: {
    label: "Manajemen Proyek",
    description: "Event / proyek catering — biaya, timeline, dokumen terkait.",
    navHref: "/dashboard/proyek"
  },
  pos: {
    label: "Kasir (POS)",
    description: "Point of sale cloud — retail, F&B, jasa. Offline + sync.",
    navHref: "/dashboard/pos"
  },
  outlet: {
    label: "Multi Outlet",
    description: "Beberapa toko/cabang per PT — L/R per outlet, tag transaksi, stok per gudang outlet."
  },
  inventory: {
    label: "Management Inventory",
    description: "Gudang, opname, transfer, retur, master produk/supplier, laporan stok.",
    navHref: "/dashboard/stok-outlet"
  },
  pembelian: {
    label: "Pembelian (Inventory)",
    description: "PO terhubung produk master — stok masuk saat posting (ERP pesantren/koperasi).",
    navHref: "/dashboard/inventory/pembelian"
  },
  titip_jual: {
    label: "Titip Jual",
    description:
      "Barang consignment — penerimaan titip, penjualan POS, settlement ke supplier (pemilik titip).",
    navHref: "/dashboard/inventory/titip-jual/penerimaan"
  },
  multi_warehouse: {
    label: "Multi Warehouse",
    description:
      "Beberapa gudang per outlet — display vs backroom, pusat distribusi. Transfer stok antar gudang dalam outlet yang sama."
  },
  pos_gramasi: {
    label: "POS Gramasi",
    description: "POS dengan timbangan / gramasi."
  },
  crm: {
    label: "CRM",
    description: "Follow-up customer & aktivitas penjualan."
  }
};

export type OrgAddonsMap = Record<AddonKey, boolean>;

export function emptyAddonsMap(): OrgAddonsMap {
  return {
    project: false,
    pos: false,
    outlet: false,
    inventory: false,
    pembelian: false,
    titip_jual: false,
    multi_warehouse: false,
    pos_gramasi: false,
    crm: false
  };
}

export function isAddonKey(value: string): value is AddonKey {
  return (ADDON_KEYS as readonly string[]).includes(value);
}

export function resolveAddonsMap(
  rows: Array<{ addon_key: string; enabled: boolean }>
): OrgAddonsMap {
  const map = emptyAddonsMap();
  for (const row of rows) {
    if (isAddonKey(row.addon_key)) {
      map[row.addon_key] = Boolean(row.enabled);
    }
  }
  return map;
}

export function isAddonEnabled(map: OrgAddonsMap, key: AddonKey): boolean {
  return map[key] === true;
}

export function listEnabledAddonKeys(map: OrgAddonsMap): AddonKey[] {
  return ADDON_KEYS.filter((key) => map[key]);
}

export function toAddonInfoList(map: OrgAddonsMap): AddonInfo[] {
  return ADDON_KEYS.map((key) => ({
    key,
    label: ADDON_CATALOG[key].label,
    description: ADDON_CATALOG[key].description,
    enabled: map[key]
  }));
}

export function orgAddonsFromInfoList(
  list: Array<{ key: AddonKey; enabled: boolean }>
): OrgAddonsMap {
  return resolveAddonsMap(list.map((a) => ({ addon_key: a.key, enabled: a.enabled })));
}
