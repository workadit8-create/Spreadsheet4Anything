"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select } from "@/components/ui/Input";
import { PRODUCT_KIND_LABELS } from "@/lib/products/inventory-policy";

type FieldType = "text" | "number" | "checkbox" | "select";

export type FieldDef = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  metaKey?: string;
  optionsKey?: string;
  options?: { value: string; label: string }[];
};

type Row = Record<string, unknown>;

export type ColumnDef = {
  key: string;
  label: string;
  metaKey?: string;
  format?: "boolean" | "product_kind";
};

export function MasterCrudPanel({
  title,
  apiPath,
  fields,
  columns,
  defaultForm = { active: true }
}: {
  title: string;
  apiPath: string;
  fields: FieldDef[];
  columns: ColumnDef[];
  defaultForm?: Row;
}) {
  const [items, setItems] = useState<Row[]>([]);
  const [extras, setExtras] = useState<Record<string, Row[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Row>(defaultForm);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiPath);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memuat");
      setItems(data.items || []);
      const extraKeys = ["units", "categories"];
      extraKeys.forEach((k) => {
        if (data[k]) setExtras((prev) => ({ ...prev, [k]: data[k] }));
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [apiPath]);

  useEffect(() => {
    load();
  }, [load]);

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
    if (col.key === "active") return row.active ? "Aktif" : "Nonaktif";
    return raw ?? "";
  }

  function fieldValue(field: FieldDef) {
    if (field.metaKey) {
      const meta = (form.metadata || {}) as Record<string, unknown>;
      return meta[field.metaKey] ?? "";
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
      const payload: Row = { ...form };
      fields.forEach((f) => {
        if (f.type === "number" && f.key in payload) payload[f.key] = Number(payload[f.key]);
      });
      const res = await fetch(apiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal simpan");
      setForm({ ...defaultForm });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal simpan");
    } finally {
      setSaving(false);
    }
  }

  function editRow(row: Row) {
    setForm({ ...row, metadata: row.metadata || {} });
  }

  function selectOptions(field: FieldDef) {
    if (field.options) return field.options;
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

  return (
    <div>
      <h2 className="mb-4 text-base font-semibold text-slate-900">{title}</h2>
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <form onSubmit={onSubmit} className="mb-6 max-w-3xl space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {fields.map((field) => (
            <div key={field.key + (field.metaKey || "")}>
              {field.type === "checkbox" ? (
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={Boolean(form[field.key])}
                    onChange={(e) => setForm({ ...form, [field.key]: e.target.checked })}
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
          ))}
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Menyimpan..." : form.id ? "Update" : "Tambah"}
          </Button>
          {form.id != null && form.id !== "" && (
            <Button type="button" variant="secondary" onClick={() => setForm({ ...defaultForm })}>
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
                {columns.map((c) => (
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
                  {columns.map((c) => (
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
