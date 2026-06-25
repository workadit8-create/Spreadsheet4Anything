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
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [sectors, setSectors] = useState<BusinessSector[]>(["retail"]);
  const [printSettings, setPrintSettings] = useState({
    invoiceFooter: "Terima kasih atas kepercayaan Anda.",
    invoiceBankInfo: "",
    showPaidStamp: true
  });
  const [suggestedBankInfo, setSuggestedBankInfo] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
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
      setLogoUrl(data.logoUrl || null);
      setSectors(data.sectors || ["retail"]);
      if (data.print) {
        setPrintSettings({
          invoiceFooter: data.print.invoiceFooter || "Terima kasih atas kepercayaan Anda.",
          invoiceBankInfo: data.print.invoiceBankInfo || "",
          showPaidStamp: data.print.showPaidStamp !== false
        });
      }
      setSuggestedBankInfo(data.suggestedBankInfo || "");
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

  async function uploadLogo(file: File) {
    setUploadingLogo(true);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const res = await fetch("/api/org/logo", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLogoUrl(data.logoUrl || null);
      setMessage("Logo diunggah");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Gagal unggah logo");
    } finally {
      setUploadingLogo(false);
    }
  }

  async function removeLogo() {
    setUploadingLogo(true);
    setMessage(null);
    try {
      const res = await fetch("/api/org/logo", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLogoUrl(null);
      setMessage("Logo dihapus");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Gagal hapus logo");
    } finally {
      setUploadingLogo(false);
    }
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
          inventory_mode: "mixed",
          invoice_footer: printSettings.invoiceFooter.trim(),
          invoice_bank_info: printSettings.invoiceBankInfo.trim(),
          show_paid_stamp: printSettings.showPaidStamp
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCompanyName(data.companyName || data.orgName || "");
      setAddress(data.address || "");
      setPhone(data.phone || "");
      setSectors(data.sectors);
      if (data.print) {
        setPrintSettings({
          invoiceFooter: data.print.invoiceFooter || printSettings.invoiceFooter,
          invoiceBankInfo: data.print.invoiceBankInfo || "",
          showPaidStamp: data.print.showPaidStamp !== false
        });
      }
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
            Nama, logo, alamat, dan pengaturan cetak dipakai di sidebar serta invoice / PO.
          </p>
        </div>
        <Button type="button" variant="secondary" onClick={save} disabled={saving}>
          {saving ? "Menyimpan..." : "Simpan profil"}
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-start gap-4">
        <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-white">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Logo perusahaan" className="max-h-full max-w-full object-contain p-1" />
          ) : (
            <span className="px-2 text-center text-[10px] text-slate-400">Belum ada logo</span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="company-logo">Logo perusahaan</Label>
          <input
            id="company-logo"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={uploadingLogo}
            className="max-w-xs text-xs text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-brand-700"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadLogo(file);
              e.target.value = "";
            }}
          />
          <p className="text-[11px] text-slate-400">PNG, JPG, atau WEBP · maks. 2 MB</p>
          {logoUrl ? (
            <button
              type="button"
              onClick={() => void removeLogo()}
              disabled={uploadingLogo}
              className="w-fit text-xs text-red-600 hover:underline disabled:opacity-60"
            >
              Hapus logo
            </button>
          ) : null}
        </div>
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
        <p className="text-xs font-medium text-slate-700">Pengaturan cetak invoice</p>
        <p className="mt-0.5 text-xs text-slate-500">
          Berlaku untuk organisasi Anda — setiap client punya pengaturan sendiri.
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="invoice-bank">Rekening / informasi pembayaran</Label>
            <textarea
              id="invoice-bank"
              rows={4}
              value={printSettings.invoiceBankInfo}
              onChange={(e) =>
                setPrintSettings((p) => ({ ...p, invoiceBankInfo: e.target.value }))
              }
              placeholder={"BCA 1234567890 a.n. TIRTA CATERING\nMandiri 0987654321 a.n. TIRTA CATERING"}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            {suggestedBankInfo ? (
              <button
                type="button"
                className="mt-2 text-xs text-brand-600 hover:underline"
                onClick={() =>
                  setPrintSettings((p) => ({ ...p, invoiceBankInfo: suggestedBankInfo }))
                }
              >
                Isi dari daftar Kas & Bank
              </button>
            ) : null}
            <p className="mt-1 text-[11px] text-slate-400">
              Tampil di invoice kredit/kurang bayar (pilih per transaksi). Isi juga detail bank di tab Kas & Bank.
            </p>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="invoice-footer">Pesan penutup invoice</Label>
            <Input
              id="invoice-footer"
              value={printSettings.invoiceFooter}
              onChange={(e) =>
                setPrintSettings((p) => ({ ...p, invoiceFooter: e.target.value }))
              }
              placeholder="Terima kasih atas kepercayaan Anda."
            />
          </div>
          <div className="sm:col-span-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={printSettings.showPaidStamp}
                onChange={(e) =>
                  setPrintSettings((p) => ({ ...p, showPaidStamp: e.target.checked }))
                }
                className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              Tampilkan stempel LUNAS jika piutang sudah habis
            </label>
          </div>
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
