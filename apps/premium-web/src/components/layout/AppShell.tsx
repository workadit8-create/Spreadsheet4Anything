"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { DemoFinishPanel } from "@/components/layout/DemoFinishPanel";
import { LogoutButton } from "@/components/layout/LogoutButton";
import { AddonsLabPanel } from "@/components/layout/AddonsLabPanel";
import {
  ADDON_CATALOG,
  ADDON_KEYS,
  type AddonInfo,
  type AddonKey,
  type OrgAddonsMap,
  orgAddonsFromInfoList
} from "@/lib/org/addons-catalog";
import {
  addonNavKey,
  isNavKeyAllowed,
  ROLE_LABELS,
  type MembershipRole,
  type NavKey
} from "@/lib/org/roles";

type NavItem = {
  key: NavKey;
  href: string;
  label: string;
  icon: string;
  addon?: AddonKey;
};

const NAV: NavItem[] = [
  { key: "dashboard", href: "/dashboard", label: "Dashboard", icon: "◆" },
  { key: "master", href: "/dashboard/master", label: "Master Data", icon: "◇" },
  { key: "penjualan", href: "/dashboard/penjualan", label: "Penjualan", icon: "◇" },
  { key: "quotation", href: "/dashboard/quotation", label: "Quotation", icon: "◇" },
  { key: "penjualan-riwayat", href: "/dashboard/penjualan/riwayat", label: "Riwayat Invoice", icon: "◇" },
  { key: "piutang", href: "/dashboard/piutang", label: "Piutang", icon: "◇" },
  { key: "pembelian", href: "/dashboard/pembelian", label: "Pembelian", icon: "◇" },
  { key: "purchase-request", href: "/dashboard/purchase-request", label: "Purchase Request", icon: "◇" },
  { key: "pembelian-riwayat", href: "/dashboard/pembelian/riwayat", label: "Riwayat PO", icon: "◇" },
  { key: "hutang", href: "/dashboard/hutang", label: "Hutang", icon: "◇" },
  { key: "kas-bank", href: "/dashboard/kas-bank", label: "Kas & Bank", icon: "◇" },
  { key: "jurnal", href: "/dashboard/jurnal", label: "Jurnal", icon: "◇" },
  { key: "jurnal-manual", href: "/dashboard/jurnal/manual", label: "Jurnal Manual", icon: "◇" },
  { key: "laporan", href: "/dashboard/laporan", label: "Laporan", icon: "◇" },
  {
    key: "proyek",
    href: "/dashboard/proyek",
    label: "Proyek",
    icon: "◇",
    addon: "project"
  },
  { key: "tim", href: "/dashboard/tim", label: "Tim & Akses", icon: "◇" },
  { key: "akun", href: "/dashboard/akun", label: "Akun", icon: "◇" }
];

function comingSoonLabels(addons: OrgAddonsMap): string[] {
  const labels: string[] = [];
  for (const key of ADDON_KEYS) {
    if (!addons[key] && key !== "project") {
      labels.push(ADDON_CATALOG[key].label);
    }
  }
  if (!addons.pos && !addons.pos_gramasi) {
    labels.push("POS / Stok");
  }
  return [...new Set(labels)];
}

export function AppShell({
  children,
  userEmail,
  orgName,
  orgLogoUrl,
  role,
  isPlatformAdmin,
  isDemo,
  addons
}: {
  children: React.ReactNode;
  userEmail?: string | null;
  orgName?: string | null;
  orgLogoUrl?: string | null;
  role: MembershipRole;
  isPlatformAdmin: boolean;
  isDemo?: boolean;
  addons: OrgAddonsMap;
}) {
  const pathname = usePathname();
  const [addonMap, setAddonMap] = useState(addons);

  useEffect(() => {
    setAddonMap(addons);
  }, [addons]);

  const handleAddonsChange = useCallback((list: AddonInfo[]) => {
    setAddonMap(orgAddonsFromInfoList(list));
  }, []);

  const visibleNav = NAV.filter((item) => {
    if (!isNavKeyAllowed(role, item.key)) return false;
    if (item.addon) {
      if (!addonMap[item.addon]) return false;
      const navKey = addonNavKey(item.addon);
      if (navKey && !isNavKeyAllowed(role, navKey)) return false;
    }
    return true;
  });
  const comingSoon = isPlatformAdmin ? comingSoonLabels(addonMap) : [];

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200/80 bg-slate-900 text-white">
        <div className="border-b border-white/10 px-5 py-5">
          {orgLogoUrl ? (
            <img
              src={orgLogoUrl}
              alt=""
              className="mb-3 h-10 w-auto max-w-full object-contain"
            />
          ) : null}
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Premium</p>
          <p className="mt-1 text-sm font-semibold text-white">{orgName || "Premium"}</p>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {visibleNav.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/dashboard" &&
                item.href !== "/dashboard/penjualan" &&
                item.href !== "/dashboard/pembelian" &&
                pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-white/10 text-white shadow-inner"
                    : "text-slate-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                <span className={`text-xs ${active ? "text-brand-500" : "text-slate-500"}`}>
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="space-y-3 p-3">
          {isDemo ? <DemoFinishPanel /> : null}
          {isPlatformAdmin ? <AddonsLabPanel onAddonsChange={handleAddonsChange} /> : null}
          {comingSoon.length > 0 ? (
            <div className="rounded-lg bg-white/5 px-3 py-3 text-[11px] text-slate-400">
              <p className="mb-2 font-semibold text-slate-300">Add-on belum aktif</p>
              <ul className="space-y-0.5">
                {comingSoon.map((label) => (
                  <li key={label}>· {label}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {userEmail && (
            <div className="rounded-lg bg-white/5 px-3 py-2 text-[11px] text-slate-400">
              <p>{userEmail}</p>
              <p className="mt-0.5 text-slate-500">Peran: {ROLE_LABELS[role]}</p>
            </div>
          )}
          <LogoutButton />
        </div>
      </aside>

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
