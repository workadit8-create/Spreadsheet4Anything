"use client";

import { useCallback, useEffect, useState } from "react";

type FieldType = "text" | "number" | "checkbox" | "select";

export type FieldDef = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  metaKey?: string;
  optionsKey?: string;
};

type Row = Record<string, unknown>;

export function MasterCrudPanel({
  title,
  apiPath,
  fields,
  columns
}: {
  title: string;
  apiPath: string;
  fields: FieldDef[];
  columns: { key: string; label: string; metaKey?: string }[];
}) {
  const [items, setItems] = useState<Row[]>([]);
  const [extras, setExtras] = useState<Record<string, Row[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Row>({ active: true });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiPath);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memuat");
      setItems(data.items || []);
      if (data.units) setExtras({ units: data.units });
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

  function getCell(row: Row, col: { key: string; metaKey?: string }) {
    if (col.metaKey) {
      const meta = (row.metadata || {}) as Record<string, unknown>;
      return meta[col.metaKey] ?? "";
    }
    if (col.key === "active") return row.active ? "Aktif" : "Nonaktif";
    return row[col.key] ?? "";
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
      if (fieldValue({ key: "active", label: "", type: "checkbox" }) === false) {
        payload.active = false;
      }
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
      setForm({ active: true });
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

  return (
    <div>
      <h2 style={{ margin: "0 0 16px", fontSize: 16 }}>{title}</h2>
      {error && (
        <p style={{ color: "#dc2626", fontSize: 13, marginBottom: 12 }}>{error}</p>
      )}
      <form onSubmit={onSubmit} style={{ display: "grid", gap: 10, marginBottom: 20, maxWidth: 640 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          {fields.map((field) => (
            <div key={field.key + (field.metaKey || "")}>
              <label style={{ fontSize: 12, fontWeight: 600 }}>{field.label}</label>
              {field.type === "checkbox" ? (
                <input
                  type="checkbox"
                  checked={Boolean(form.active)}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  style={{ marginTop: 6 }}
                />
              ) : field.type === "select" && field.optionsKey ? (
                <select
                  value={String(fieldValue(field) || "")}
                  onChange={(e) => setFieldValue(field, e.target.value || null)}
                  style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #e2e8f0", boxSizing: "border-box" }}
                >
                  <option value="">—</option>
                  {(extras[field.optionsKey] || []).map((u) => (
                    <option key={String(u.id)} value={String(u.id)}>
                      {String(u.code)} — {String(u.name)}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={field.type === "number" ? "number" : "text"}
                  required={field.required}
                  placeholder={field.placeholder}
                  value={String(fieldValue(field) ?? "")}
                  onChange={(e) =>
                    setFieldValue(field, field.type === "number" ? e.target.value : e.target.value)
                  }
                  style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 8, border: "1px solid #e2e8f0", boxSizing: "border-box" }}
                />
              )}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="submit"
            disabled={saving}
            style={{
              padding: "8px 14px",
              background: "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontWeight: 600,
              cursor: saving ? "wait" : "pointer"
            }}
          >
            {saving ? "Menyimpan..." : form.id ? "Update" : "Tambah"}
          </button>
          {form.id != null && form.id !== "" && (
            <button
              type="button"
              onClick={() => setForm({ active: true })}
              style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff" }}
            >
              Batal edit
            </button>
          )}
        </div>
      </form>

      {loading ? (
        <p style={{ color: "#64748b", fontSize: 14 }}>Memuat...</p>
      ) : !items.length ? (
        <p style={{ color: "#64748b", fontSize: 14 }}>Belum ada data.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#64748b" }}>
              {columns.map((c) => (
                <th key={c.key + (c.metaKey || "")} style={{ padding: "8px 6px", borderBottom: "1px solid #e2e8f0" }}>
                  {c.label}
                </th>
              ))}
              <th style={{ padding: "8px 6px", borderBottom: "1px solid #e2e8f0" }} />
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={String(row.id)}>
                {columns.map((c) => (
                  <td key={c.key + (c.metaKey || "")} style={{ padding: "8px 6px", borderBottom: "1px solid #f1f5f9" }}>
                    {String(getCell(row, c))}
                  </td>
                ))}
                <td style={{ padding: "8px 6px", borderBottom: "1px solid #f1f5f9" }}>
                  <button type="button" onClick={() => editRow(row)} style={{ fontSize: 13, color: "#2563eb", background: "none", border: "none", cursor: "pointer" }}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
