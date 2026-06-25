"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BUSINESS_SECTOR_LABELS,
  type BusinessSector
} from "@/lib/products/inventory-policy";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";

const ALL_SECTORS = Object.keys(BUSINESS_SECTOR_LABELS) as BusinessSector[];

export function BusinessProfilePanel() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [sectors, setSectors] = useState<BusinessSector[]>(["retail"]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/org/business-profile");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCompanyName(data.companyName || data.orgName || "");
      setAddress(data.address || "");
      setPhone(data.phone || "");
      setSectors(data.sectors || ["retail"]);
    } catch {
      setSectors(["retail"]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function toggleSector(sector: BusinessSector) {
    setSectors((prev) =>
      prev.includes(sector) ? prev.filter((s) => s !== sector) : [...prev, sector]
    );
  }

  async function save() {
    if (!companyName.trim()) {
      setMessage("Nama perusahaan wajib diisi");
      return;
    }
    if (!sectors.length) {
      setMessage("Pilih minimal satu sektor usaha");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/org/business-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: companyName.trim(),
          address: address.trim(),
          phone: phone.trim(),
          sectors,
          inventory_mode: "mixed"
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCompanyName(data.companyName || data.orgName || "");
      setAddress(data.address || "");
      setPhone(data.phone || "");
      setSectors(data.sectors);
      setMessage("Profil usaha disimpan");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Gagal simpan");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Memuat profil usaha...</p>;
  }

  return (
    <div className="mb-6 rounded-xl border border-slate-200/80 bg-gradient-to-br from-slate-50 to-white p-4 shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Profil usaha</h2>
          <p className="mt-1 text-xs text-slate-500">
            Nama dan alamat dipakai di sidebar serta cetak invoice / PO.
          </p>
        </div>
        <Button type="button" variant="secondary" onClick={save} disabled={saving}>
          {saving ? "Menyimpan..." : "Simpan profil"}
        </Button>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="company-name">Nama perusahaan</Label>
          <Input
            id="company-name"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Contoh: PT Maju Jaya"
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="company-address">Alamat</Label>
          <Input
            id="company-address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Alamat lengkap untuk cetak dokumen"
          />
        </div>
        <div>
          <Label htmlFor="company-phone">Telepon</Label>
          <Input
            id="company-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="08xx / (021) xxx"
          />
        </div>
      </div>

      <div className="mt-5 border-t border-slate-100 pt-4">
        <p className="text-xs font-medium text-slate-700">Sektor usaha</p>
        <p className="mt-0.5 text-xs text-slate-500">
          Retail, F&B, manufaktur, jasa — kategori produk menentukan pola stok.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {ALL_SECTORS.map((sector) => {
            const active = sectors.includes(sector);
            return (
              <button
                key={sector}
                type="button"
                onClick={() => toggleSector(sector)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  active
                    ? "bg-brand-600 text-white"
                    : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                }`}
              >
                {BUSINESS_SECTOR_LABELS[sector]}
              </button>
            );
          })}
        </div>
      </div>

      {message && <p className="mt-3 text-xs text-slate-500">{message}</p>}
    </div>
  );
}
