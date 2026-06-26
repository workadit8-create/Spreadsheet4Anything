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
  { key: "tax", href: "/dashboard/tax", label: "Pajak", icon: "◇" },
  {
    key: "proyek",
    href: "/dashboard/proyek",
    label: "Proyek",
    icon: "◇",
    addon: "project"
  },
  { key: "tim", href: "/dashboard/tim", label: "Tim & Akses", icon: "◇" },
  { key: "audit-log", href: "/dashboard/audit-log", label: "Log Audit", icon: "◇" },
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

function isNavActive(pathname: string, href: string): boolean {
  return (
    pathname === href ||
    (href !== "/dashboard" &&
      href !== "/dashboard/penjualan" &&
      href !== "/dashboard/pembelian" &&
      pathname.startsWith(href))
  );
}

function MenuIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function SidebarPanel({
  pathname,
  visibleNav,
  orgName,
  orgLogoUrl,
  userEmail,
  role,
  isDemo,
  isPlatformAdmin,
  comingSoon,
  onAddonsChange,
  onNavigate
}: {
  pathname: string;
  visibleNav: NavItem[];
  orgName?: string | null;
  orgLogoUrl?: string | null;
  userEmail?: string | null;
  role: MembershipRole;
  isDemo?: boolean;
  isPlatformAdmin: boolean;
  comingSoon: string[];
  onAddonsChange: (list: AddonInfo[]) => void;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className="border-b border-white/10 px-5 py-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {orgLogoUrl ? (
              <img
                src={orgLogoUrl}
                alt=""
                className="mb-3 h-10 w-auto max-w-full object-contain"
              />
            ) : null}
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Premium</p>
            <p className="mt-1 truncate text-sm font-semibold text-white">{orgName || "Premium"}</p>
          </div>
          {onNavigate ? (
            <button
              type="button"
              onClick={onNavigate}
              className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white md:hidden"
              aria-label="Tutup menu"
            >
              <CloseIcon />
            </button>
          ) : null}
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {visibleNav.map((item) => {
          const active = isNavActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
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
        {isPlatformAdmin ? <AddonsLabPanel onAddonsChange={onAddonsChange} /> : null}
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
            <p className="truncate">{userEmail}</p>
            <p className="mt-0.5 text-slate-500">Peran: {ROLE_LABELS[role]}</p>
          </div>
        )}
        <LogoutButton />
      </div>
    </>
  );
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
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    setAddonMap(addons);
  }, [addons]);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!navOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [navOpen]);

  const handleAddonsChange = useCallback((list: AddonInfo[]) => {
    setAddonMap(orgAddonsFromInfoList(list));
  }, []);

  const closeNav = useCallback(() => setNavOpen(false), []);

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

  const sidebarProps = {
    pathname,
    visibleNav,
    orgName,
    orgLogoUrl,
    userEmail,
    role,
    isDemo,
    isPlatformAdmin,
    comingSoon,
    onAddonsChange: handleAddonsChange
  };

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200/80 bg-slate-900 text-white md:flex">
        <SidebarPanel {...sidebarProps} />
      </aside>

      {/* Mobile drawer */}
      {navOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-900/50 md:hidden"
          aria-label="Tutup menu"
          onClick={closeNav}
        />
      ) : null}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(18rem,85vw)] flex-col bg-slate-900 text-white shadow-xl transition-transform duration-200 ease-out md:hidden ${
          navOpen ? "translate-x-0" : "-translate-x-full pointer-events-none"
        }`}
        aria-hidden={!navOpen}
      >
        <SidebarPanel {...sidebarProps} onNavigate={closeNav} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200/80 bg-white/95 px-4 py-3 backdrop-blur md:hidden">
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            className="rounded-lg border border-slate-200 p-2 text-slate-700 hover:bg-slate-50"
            aria-label="Buka menu"
            aria-expanded={navOpen}
          >
            <MenuIcon />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">{orgName || "Premium"}</p>
            <p className="truncate text-xs text-slate-500">{ROLE_LABELS[role]}</p>
          </div>
          {orgLogoUrl ? (
            <img src={orgLogoUrl} alt="" className="h-8 w-auto max-w-[4rem] shrink-0 object-contain" />
          ) : null}
        </header>

        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
