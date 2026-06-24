"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "🏠" },
  { href: "/dashboard/master", label: "Master Data", icon: "📚" },
  { href: "/dashboard/invoices", label: "Invoice lab", icon: "🧾" },
  { href: "/dashboard/laporan", label: "Laporan bridge", icon: "📊" }
];

const COMING_SOON = [
  "Kas & Bank",
  "Quotation",
  "Pemasukan",
  "Piutang",
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
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <aside
        style={{
          width: 220,
          background: "#1f2937",
          color: "#fff",
          padding: "20px 0",
          flexShrink: 0
        }}
      >
        <div style={{ padding: "0 16px 20px", fontWeight: 700, fontSize: 14 }}>PREMIUM · HYBRID LAB</div>
        {NAV.map((item) => {
          const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: "block",
                padding: "10px 16px",
                margin: "0 8px 4px",
                borderRadius: 8,
                textDecoration: "none",
                color: "#fff",
                fontSize: 14,
                background: active ? "#374151" : "transparent"
              }}
            >
              {item.icon} {item.label}
            </Link>
          );
        })}
        <div style={{ margin: "16px 12px 0", padding: 12, background: "#374151", borderRadius: 8, fontSize: 11, color: "#9ca3af" }}>
          <div style={{ color: "#e5e7eb", fontSize: 12, marginBottom: 6 }}>Coming soon</div>
          {COMING_SOON.map((label) => (
            <div key={label} style={{ marginBottom: 2 }}>· {label}</div>
          ))}
        </div>
        {userEmail && (
          <div style={{ margin: "16px 12px 0", padding: 12, background: "#374151", borderRadius: 8, fontSize: 11, color: "#d1d5db" }}>
            {userEmail}
          </div>
        )}
      </aside>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}
