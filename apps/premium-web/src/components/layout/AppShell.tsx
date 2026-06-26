"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  SIDEBAR_GROUPS,
  SIDEBAR_STANDALONE_BOTTOM,
  SIDEBAR_STANDALONE_TOP,
  isSidebarHrefActive,
  sidebarItemVisible,
  type SidebarGroup,
  type SidebarNavItem
} from "@/lib/nav/sidebar-config";
import { isNavKeyAllowed, ROLE_LABELS, type MembershipRole } from "@/lib/org/roles";

function comingSoonLabels(addons: OrgAddonsMap): string[] {
  const labels: string[] = [];
  for (const key of ADDON_KEYS) {
    if (!addons[key] && key !== "project") {
      labels.push(ADDON_CATALOG[key].label);
    }
  }
  if (!addons.pos && !addons.pos_gramasi) {
    labels.push("CRM");
  }
  return [...new Set(labels)];
}

function navItemAllowed(
  item: SidebarNavItem,
  role: MembershipRole,
  addonMap: OrgAddonsMap
): boolean {
  if (!isNavKeyAllowed(role, item.key)) return false;
  return sidebarItemVisible(item, addonMap);
}

function filterGroup(group: SidebarGroup, role: MembershipRole, addonMap: OrgAddonsMap): SidebarGroup | null {
  const items = group.items.filter((item) => navItemAllowed(item, role, addonMap));
  if (!items.length) return null;
  return { ...group, items };
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? "rotate-90" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
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

function SidebarNavLink({
  item,
  pathname,
  onNavigate,
  indent
}: {
  item: SidebarNavItem;
  pathname: string;
  onNavigate?: () => void;
  indent?: boolean;
}) {
  const active = isSidebarHrefActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={`flex items-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors ${
        indent ? "pl-9 pr-3" : "px-3"
      } ${
        active
          ? "bg-white/10 text-white shadow-inner"
          : "text-slate-300 hover:bg-white/5 hover:text-white"
      }`}
    >
      {item.label}
    </Link>
  );
}

function SidebarGroupSection({
  group,
  pathname,
  open,
  onToggle,
  onNavigate
}: {
  group: SidebarGroup;
  pathname: string;
  open: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}) {
  const hasActive = group.items.some((item) => isSidebarHrefActive(pathname, item.href));

  return (
    <div className="py-0.5">
      <button
        type="button"
        onClick={onToggle}
        className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
          hasActive ? "text-white" : "text-slate-200 hover:bg-white/5 hover:text-white"
        }`}
      >
        <span>{group.label}</span>
        <Chevron open={open} />
      </button>
      {open ? (
        <div className="mt-0.5 space-y-0.5 border-l border-white/10 ml-4 pl-1">
          {group.items.map((item) => (
            <SidebarNavLink
              key={`${group.id}-${item.href}`}
              item={item}
              pathname={pathname}
              onNavigate={onNavigate}
              indent
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SidebarPanel({
  pathname,
  groups,
  standaloneTop,
  standaloneBottom,
  orgName,
  orgLogoUrl,
  userEmail,
  role,
  isDemo,
  isPlatformAdmin,
  comingSoon,
  openGroups,
  onToggleGroup,
  onAddonsChange,
  onNavigate
}: {
  pathname: string;
  groups: SidebarGroup[];
  standaloneTop: SidebarNavItem[];
  standaloneBottom: SidebarNavItem[];
  orgName?: string | null;
  orgLogoUrl?: string | null;
  userEmail?: string | null;
  role: MembershipRole;
  isDemo?: boolean;
  isPlatformAdmin: boolean;
  comingSoon: string[];
  openGroups: Record<string, boolean>;
  onToggleGroup: (groupId: string) => void;
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

      <nav className="flex-1 overflow-y-auto p-3">
        <div className="space-y-0.5">
          {standaloneTop.map((item) => (
            <SidebarNavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />
          ))}
        </div>

        <div className="mt-2 space-y-1">
          {groups.map((group) => (
            <SidebarGroupSection
              key={group.id}
              group={group}
              pathname={pathname}
              open={openGroups[group.id] ?? false}
              onToggle={() => onToggleGroup(group.id)}
              onNavigate={onNavigate}
            />
          ))}
        </div>

        <div className="mt-3 space-y-0.5 border-t border-white/10 pt-3">
          {standaloneBottom.map((item) => (
            <SidebarNavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />
          ))}
        </div>
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
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

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

  const visibleGroups = useMemo(
    () =>
      SIDEBAR_GROUPS.map((g) => filterGroup(g, role, addonMap)).filter(
        (g): g is SidebarGroup => g !== null
      ),
    [role, addonMap]
  );

  const standaloneTop = useMemo(
    () => SIDEBAR_STANDALONE_TOP.filter((item) => navItemAllowed(item, role, addonMap)),
    [role, addonMap]
  );

  const standaloneBottom = useMemo(
    () => SIDEBAR_STANDALONE_BOTTOM.filter((item) => navItemAllowed(item, role, addonMap)),
    [role, addonMap]
  );

  useEffect(() => {
    const next: Record<string, boolean> = {};
    for (const group of visibleGroups) {
      const active = group.items.some((item) => isSidebarHrefActive(pathname, item.href));
      if (active) next[group.id] = true;
    }
    if (Object.keys(next).length) {
      setOpenGroups((prev) => ({ ...prev, ...next }));
    }
  }, [pathname, visibleGroups]);

  const handleAddonsChange = useCallback((list: AddonInfo[]) => {
    setAddonMap(orgAddonsFromInfoList(list));
  }, []);

  const toggleGroup = useCallback((groupId: string) => {
    setOpenGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  }, []);

  const closeNav = useCallback(() => setNavOpen(false), []);

  const comingSoon = isPlatformAdmin ? comingSoonLabels(addonMap) : [];
  const isPosFullscreen = pathname === "/dashboard/pos" || pathname.startsWith("/dashboard/pos/");

  const sidebarProps = {
    pathname,
    groups: visibleGroups,
    standaloneTop,
    standaloneBottom,
    orgName,
    orgLogoUrl,
    userEmail,
    role,
    isDemo,
    isPlatformAdmin,
    comingSoon,
    openGroups,
    onToggleGroup: toggleGroup,
    onAddonsChange: handleAddonsChange
  };

  if (isPosFullscreen) {
    return <div className="min-h-screen">{children}</div>;
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200/80 bg-slate-900 text-white md:flex">
        <SidebarPanel {...sidebarProps} />
      </aside>

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
