import type { OutletWarehouseOption } from "@/lib/inventory/warehouse-resolve";

export function formatWarehouseOptionLabel(
  w: Pick<OutletWarehouseOption, "code" | "name" | "isDisplay"> & {
    warehouseRole?: string;
  }
): string {
  const tags: string[] = [];
  if (w.warehouseRole === "distribution") tags.push("distribusi");
  if (w.isDisplay) tags.push("display");
  const suffix = tags.length ? ` (${tags.join(" · ")})` : "";
  return `${w.code} — ${w.name}${suffix}`;
}
