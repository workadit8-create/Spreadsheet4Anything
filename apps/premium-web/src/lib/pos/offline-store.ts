const DB_NAME = "premium-pos-v1";
const DB_VERSION = 1;
const STORE_CATALOG = "catalog";
const STORE_PENDING = "pending";

export type PosCatalogSnapshot = {
  syncedAt: string;
  orgId: string;
  orgName: string;
  warehouseId: string | null;
  walkInCustomerId: string;
  defaultKasRekening: string;
  businessSectors: string[];
  categories: Array<{ id: string; code: string | null; name: string; sort_order: number }>;
  products: Array<{
    id: string;
    sku: string | null;
    name: string;
    sell_price: number;
    category_id: string | null;
    category_name: string | null;
    unit_code: string;
    effective_tracks_stock: boolean;
    effective_product_kind: string;
    stock_qty: number | null;
  }>;
  kasBank: Array<{ id: string; name: string; bankDisplay: string }>;
  tax: { active: boolean; taxLabel?: string; ratePercent?: number; priceIncludesTax?: boolean };
};

export type PosPendingSale = {
  local_id: string;
  device_label: string;
  created_at: string;
  payload: {
    lines: Array<{
      product_id: string;
      qty: number;
      unit_price?: number;
      note?: string;
    }>;
    bayar?: number;
    rekening?: string;
    payment_method?: "cash" | "transfer";
    warehouse_id?: string;
  };
  receipt: {
    receiptNo: string;
    total: number;
    change: number;
    lines: Array<{ name: string; qty: number; unit_price: number; line_total: number; note?: string }>;
  };
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB tidak tersedia"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error || new Error("Gagal buka IndexedDB"));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_CATALOG)) {
        db.createObjectStore(STORE_CATALOG);
      }
      if (!db.objectStoreNames.contains(STORE_PENDING)) {
        db.createObjectStore(STORE_PENDING, { keyPath: "local_id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

function txDone<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB error"));
  });
}

export async function savePosCatalog(orgId: string, snapshot: PosCatalogSnapshot): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_CATALOG, "readwrite");
    await txDone(tx.objectStore(STORE_CATALOG).put(snapshot, orgId));
  } finally {
    db.close();
  }
}

export async function loadPosCatalog(orgId: string): Promise<PosCatalogSnapshot | null> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_CATALOG, "readonly");
    const result = await txDone(tx.objectStore(STORE_CATALOG).get(orgId));
    return (result as PosCatalogSnapshot) || null;
  } catch {
    return null;
  } finally {
    db.close();
  }
}

export async function addPendingSale(sale: PosPendingSale): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_PENDING, "readwrite");
    await txDone(tx.objectStore(STORE_PENDING).put(sale));
  } finally {
    db.close();
  }
}

export async function listPendingSales(): Promise<PosPendingSale[]> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_PENDING, "readonly");
    const result = await txDone(tx.objectStore(STORE_PENDING).getAll());
    return (result as PosPendingSale[]) || [];
  } catch {
    return [];
  } finally {
    db.close();
  }
}

export async function removePendingSale(localId: string): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_PENDING, "readwrite");
    await txDone(tx.objectStore(STORE_PENDING).delete(localId));
  } finally {
    db.close();
  }
}

export function newLocalId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function getDeviceLabel(): string {
  if (typeof navigator === "undefined") return "device";
  const ua = navigator.userAgent;
  if (/iPad|Tablet/i.test(ua)) return "tablet";
  if (/Mobile|Android/i.test(ua)) return "mobile";
  return "desktop";
}
