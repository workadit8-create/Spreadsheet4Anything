"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select } from "@/components/ui/Input";
import { PRODUCT_KIND_LABELS } from "@/lib/products/inventory-policy";
import { resolveFormTrackStock } from "@/lib/products/product-hpp";

type FieldType = "text" | "number" | "checkbox" | "select";

export type FieldDef = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  metaKey?: string;
  optionsKey?: string;
  coaAccountTypes?: string[];
  options?: { value: string; label: string }[];
  /** Tampil hanya jika org inventory ON dan form = kelola stok */
  whenTrackStock?: boolean;
};

type Row = Record<string, unknown>;

export type ColumnDef = {
  key: string;
  label: string;
  metaKey?: string;
  format?: "boolean" | "product_kind" | "tax_taxable" | "money";
};

type ProductTaxApiConfig = {
  productTaxEnabled: boolean;
  taxableFieldLabel: string;
  taxColumnLabel: string;
  activeType: string;
};

const DEFAULT_ACTIVE_FORM: Row = { active: true };

export function MasterCrudPanel({
  title,
  apiPath,
  fields,
  columns,
  defaultForm,
  productTaxFromApi = false,
  productInventoryFromApi = false,
  scopedOutletCode
}: {
  title: string;
  apiPath: string;
  fields: FieldDef[];
  columns: ColumnDef[];
  defaultForm?: Row;
  /** Baca konfig pajak produk dari GET (Master → Produk) */
  productTaxFromApi?: boolean;
  /** Baca add-on inventory dari GET (field HPP + validasi stok) */
  productInventoryFromApi?: boolean;
  /** Filter daftar + prefill outlet (halaman inventory per outlet) */
  scopedOutletCode?: string;
}) {
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  const defaultFormRef = useRef(defaultForm ?? DEFAULT_ACTIVE_FORM);
  defaultFormRef.current = defaultForm ?? DEFAULT_ACTIVE_FORM;

  const [items, setItems] = useState<Row[]>([]);
  const [extras, setExtras] = useState<Record<string, Row[]>>({});
  const [productTax, setProductTax] = useState<ProductTaxApiConfig | null>(null);
  const [inventoryEnabled, setInventoryEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resolvedApiPath = useMemo(() => {
    if (!scopedOutletCode) return apiPath;
    const sep = apiPath.includes("?") ? "&" : "?";
    return `${apiPath}${sep}outlet_code=${encodeURIComponent(scopedOutletCode)}`;
  }, [apiPath, scopedOutletCode]);

  const [form, setForm] = useState<Row>(() => defaultFormRef.current);

  useEffect(() => {
    if (!scopedOutletCode) return;
    setForm((prev) => {
      if (prev.id != null && prev.id !== "") return prev;
      const meta = { ...((prev.metadata || {}) as Record<string, unknown>) };
      meta.outlet = scopedOutletCode;
      return { ...prev, metadata: meta };
    });
  }, [scopedOutletCode]);

  const taxProductFields = useMemo<FieldDef[]>(() => {
    if (!productTax?.productTaxEnabled) return [];
    return [
      {
        key: "tax_taxable",
        label: productTax.taxableFieldLabel,
        type: "checkbox"
      }
    ];
  }, [productTax]);

  const taxProductColumns = useMemo<ColumnDef[]>(() => {
    if (!productTax?.productTaxEnabled) return [];
    return [
      {
        key: "tax_taxable",
        label: productTax.taxColumnLabel,
        format: "tax_taxable"
      }
    ];
  }, [productTax]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(resolvedApiPath);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memuat");
      setItems(data.items || []);
      if (productTaxFromApi && data.tax) {
        setProductTax({
          productTaxEnabled: data.tax.productTaxEnabled === true,
          taxableFieldLabel: String(data.tax.taxableFieldLabel || "Kena pajak"),
          taxColumnLabel: String(data.tax.taxColumnLabel || "Pajak"),
          activeType: String(data.tax.activeType || "none")
        });
      }
      if (productInventoryFromApi) {
        setInventoryEnabled(data.inventory?.enabled === true);
      }
      const extraKeys = ["units", "categories", "coa_accounts", "outlets"];
      extraKeys.forEach((k) => {
        if (data[k]) setExtras((prev) => ({ ...prev, [k]: data[k] }));
      });
      const needsCoa = fieldsRef.current.some((f) => f.optionsKey === "coa_accounts");
      if (needsCoa && !data.coa_accounts) {
        const coaRes = await fetch("/api/master/coa");
        const coaData = await coaRes.json();
        if (coaRes.ok) {
          setExtras((prev) => ({
            ...prev,
            coa_accounts: (coaData.items || []).filter((a: Row) => a.active !== false)
          }));
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [resolvedApiPath, productTaxFromApi, productInventoryFromApi]);

  const formTracksStock = useCallback(
    (row: Row) => {
      if (!inventoryEnabled) return false;
      const categories = (extras.categories || []) as Array<{
        id: string;
        tracks_stock?: boolean | null;
      }>;
      return resolveFormTrackStock(
        String(row.stock_policy || "inherit"),
        row.category_id ? String(row.category_id) : null,
        categories
      );
    },
    [inventoryEnabled, extras.categories]
  );

  const visibleFields = useCallback(
    (sourceFields: FieldDef[]) =>
      sourceFields.filter((f) => !f.whenTrackStock || formTracksStock(form)),
    [form, formTracksStock]
  );

  const activeFields = useMemo(() => {
    const base =
      productTax?.productTaxEnabled && taxProductFields.length
        ? [...fields, ...taxProductFields]
        : fields;
    return visibleFields(base);
  }, [fields, productTax?.productTaxEnabled, taxProductFields, visibleFields]);
  const activeColumns = useMemo(() => {
    const base =
      productTax?.productTaxEnabled && taxProductColumns.length
        ? [...columns, ...taxProductColumns]
        : columns;
    if (!inventoryEnabled) {
      return base.filter((c) => c.key !== "hpp");
    }
    return base;
  }, [columns, productTax?.productTaxEnabled, taxProductColumns, inventoryEnabled]);
  const activeDefaultForm = useMemo(() => {
    let base: Row =
      productTax?.productTaxEnabled && taxProductFields.length
        ? { ...defaultFormRef.current, active: true, tax_taxable: true }
        : { ...defaultFormRef.current, active: true };
    if (inventoryEnabled) {
      base = { ...base, stock_policy: base.stock_policy || "track" };
    }
    if (scopedOutletCode) {
      const meta = { ...((base.metadata || {}) as Record<string, unknown>), outlet: scopedOutletCode };
      base = { ...base, metadata: meta };
    }
    return base;
  }, [
    productTax?.productTaxEnabled,
    taxProductFields.length,
    inventoryEnabled,
    scopedOutletCode
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const productTaxFormInitRef = useRef(false);
  useEffect(() => {
    if (!productTax?.productTaxEnabled || !taxProductFields.length) return;
    if (productTaxFormInitRef.current) return;
    productTaxFormInitRef.current = true;
    setForm((prev) => {
      if (prev.id != null && prev.id !== "") return prev;
      return { ...defaultFormRef.current, active: true, tax_taxable: true };
    });
  }, [productTax?.productTaxEnabled, taxProductFields.length]);

  function getCell(row: Row, col: ColumnDef) {
    if (col.metaKey) {
      const meta = (row.metadata || {}) as Record<string, unknown>;
      return meta[col.metaKey] ?? "";
    }
    const raw = row[col.key];
    if (col.format === "boolean") {
      return raw ? "Ya" : "Tidak";
    }
    if (col.format === "product_kind") {
      const kind = String(raw || "");
      return PRODUCT_KIND_LABELS[kind as keyof typeof PRODUCT_KIND_LABELS] || kind;
    }
    if (col.format === "tax_taxable") {
      const taxable = row.tax_taxable ?? row.ppn_taxable;
      return taxable === true ? "Ya" : "Tidak";
    }
    if (col.format === "money") {
      const n = Number(raw);
      if (!Number.isFinite(n)) return "—";
      return n.toLocaleString("id-ID");
    }
    if (col.key === "active") return row.active ? "Aktif" : "Nonaktif";
    return raw ?? "";
  }

  function fieldValue(field: FieldDef) {
    if (field.metaKey) {
      const meta = (form.metadata || {}) as Record<string, unknown>;
      return meta[field.metaKey] ?? "";
    }
    if (field.key === "tax_taxable") {
      return form.tax_taxable ?? form.ppn_taxable ?? "";
    }
    return form[field.key] ?? "";
  }

  function setFieldValue(field: FieldDef, value: unknown) {
    if (field.metaKey) {
      const meta = { ...((form.metadata || {}) as Record<string, unknown>), [field.metaKey]: value };
      setForm({ ...form, metadata: meta });
      return;
    }
    setForm({ ...form, [field.key]: value });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (inventoryEnabled && formTracksStock(form)) {
        const meta = (form.metadata || {}) as Record<string, unknown>;
        const hppRaw = meta.hpp ?? form.hpp;
        if (hppRaw === undefined || hppRaw === null || String(hppRaw).trim() === "") {
          throw new Error("HPP wajib untuk produk yang kelola stok");
        }
        const hppNum = Number(hppRaw);
        if (!Number.isFinite(hppNum) || hppNum < 0) {
          throw new Error("HPP tidak valid");
        }
        if (hppNum === 0) {
          const ok = window.confirm(
            "HPP = 0 — jurnal HPP penjualan akan Rp 0. Lanjut simpan?"
          );
          if (!ok) {
            setSaving(false);
            return;
          }
        }
      }

      const payload: Row = { ...form };
      activeFields.forEach((f) => {
        if (f.type === "number" && f.key in payload) payload[f.key] = Number(payload[f.key]);
        if (f.type === "number" && f.metaKey) {
          const meta = { ...((payload.metadata || {}) as Record<string, unknown>) };
          if (meta[f.metaKey] !== undefined && meta[f.metaKey] !== "") {
            meta[f.metaKey] = Number(meta[f.metaKey]);
          }
          payload.metadata = meta;
        }
      });
      const res = await fetch(apiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal simpan");
      setForm({ ...activeDefaultForm });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal simpan");
    } finally {
      setSaving(false);
    }
  }

  function editRow(row: Row) {
    const meta = { ...((row.metadata || {}) as Record<string, unknown>) };
    if (row.hpp != null && meta.hpp == null) meta.hpp = row.hpp;
    setForm({
      ...row,
      metadata: meta,
      tax_taxable: row.tax_taxable === true || row.ppn_taxable === true,
      pkp: row.pkp === true
    });
  }

  function selectOptions(field: FieldDef) {
    if (field.options) return field.options;
    if (field.optionsKey === "coa_accounts") {
      let accounts = extras.coa_accounts || [];
      if (field.coaAccountTypes?.length) {
        accounts = accounts.filter((a) =>
          field.coaAccountTypes!.includes(String(a.account_type))
        );
      }
      return accounts.map((a) => ({
        value: String(a.name),
        label: `${String(a.code)} — ${String(a.name)}`
      }));
    }
    if (field.optionsKey === "outlets") {
      return (extras.outlets || []).map((o) => ({
        value: String(o.code),
        label: String(o.name)
      }));
    }
    if (field.optionsKey) {
      return (extras[field.optionsKey] || []).map((u) => ({
        value: String(u.id),
        label: field.optionsKey === "categories"
          ? `${String(u.code || u.name)} — ${String(u.name)}`
          : `${String(u.code)} — ${String(u.name)}`
      }));
    }
    return [];
  }

  const taxHint =
    productTax?.activeType === "pb"
      ? "PB aktif — centang produk yang kena PB."
      : "PPN aktif — centang produk yang kena PPN.";

  return (
    <div>
      <h2 className="mb-4 text-base font-semibold text-slate-900">{title}</h2>
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {productTax?.productTaxEnabled ? (
        <p className="mb-4 text-xs text-slate-500">
          {taxHint} Pajak dihitung otomatis saat simpan invoice/PO.
        </p>
      ) : null}

      {inventoryEnabled ? (
        <p className="mb-4 text-xs text-slate-500">
          Produk dengan stok wajib isi HPP awal. Setelah ada pembelian inventory, HPP otomatis
          dihitung rata-rata tertimbang dari harga beli.
        </p>
      ) : null}

      {scopedOutletCode ? (
        <p className="mb-4 text-xs text-slate-500">
          Daftar produk outlet <span className="font-semibold">{scopedOutletCode}</span> — tambah
          produk baru otomatis ter-assign ke outlet ini.
        </p>
      ) : null}

      <form onSubmit={onSubmit} className="mb-6 max-w-3xl space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {activeFields.map((field) => {
            if (field.optionsKey === "outlets" && !(extras.outlets || []).length) {
              return null;
            }
            return (
            <div key={field.key + (field.metaKey || "")}>
              {field.type === "checkbox" ? (
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={Boolean(fieldValue(field))}
                    onChange={(e) => setFieldValue(field, e.target.checked)}
                    className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  {field.label}
                </label>
              ) : (
                <>
                  <Label>{field.label}</Label>
                  {field.type === "select" ? (
                    <Select
                      value={String(fieldValue(field) || "")}
                      onChange={(e) => setFieldValue(field, e.target.value || null)}
                    >
                      <option value="">—</option>
                      {selectOptions(field).map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Input
                      type={field.type === "number" ? "number" : "text"}
                      required={field.required}
                      placeholder={field.placeholder}
                      value={String(fieldValue(field) ?? "")}
                      onChange={(e) => setFieldValue(field, e.target.value)}
                    />
                  )}
                </>
              )}
            </div>
            );
          })}
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Menyimpan..." : form.id ? "Update" : "Tambah"}
          </Button>
          {form.id != null && form.id !== "" && (
            <Button type="button" variant="secondary" onClick={() => setForm({ ...activeDefaultForm })}>
              Batal edit
            </Button>
          )}
        </div>
      </form>

      {loading ? (
        <p className="text-sm text-slate-500">Memuat...</p>
      ) : !items.length ? (
        <p className="text-sm text-slate-500">Belum ada data.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                {activeColumns.map((c) => (
                  <th key={c.key + (c.metaKey || "")} className="px-4 py-3">
                    {c.label}
                  </th>
                ))}
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((row) => (
                <tr key={String(row.id)} className="hover:bg-slate-50/80">
                  {activeColumns.map((c) => (
                    <td key={c.key + (c.metaKey || "")} className="px-4 py-3 text-slate-700">
                      {String(getCell(row, c))}
                    </td>
                  ))}
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => editRow(row)}
                      className="text-sm font-medium text-brand-600 hover:text-brand-700"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
