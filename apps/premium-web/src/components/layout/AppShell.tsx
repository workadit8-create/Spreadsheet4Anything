"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "◆" },
  { href: "/dashboard/master", label: "Master Data", icon: "◇" },
  { href: "/dashboard/invoices", label: "Invoice", icon: "◇" },
  { href: "/dashboard/piutang", label: "Piutang", icon: "◇" },
  { href: "/dashboard/laporan", label: "Laporan", icon: "◇" }
];

const COMING_SOON = [
  "Kas & Bank",
  "Quotation",
  "Pembelian",
  "Hutang",
  "Jurnal",
  "Posting",
  "POS / Stok"
];

export function AppShell({
  children,
  userEmail
}: {
  children: React.ReactNode;
  userEmail?: string | null;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200/80 bg-slate-900 text-white">
        <div className="border-b border-white/10 px-5 py-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Premium</p>
          <p className="mt-1 text-sm font-semibold text-white">HYBRID LAB</p>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {NAV.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));
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
          <div className="rounded-lg bg-white/5 px-3 py-3 text-[11px] text-slate-400">
            <p className="mb-2 font-semibold text-slate-300">Coming soon</p>
            <ul className="space-y-0.5">
              {COMING_SOON.map((label) => (
                <li key={label}>· {label}</li>
              ))}
            </ul>
          </div>
          {userEmail && (
            <div className="rounded-lg bg-white/5 px-3 py-2 text-[11px] text-slate-400">
              {userEmail}
            </div>
          )}
        </div>
      </aside>

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
