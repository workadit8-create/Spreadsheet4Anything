import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, slug, name")
    .limit(5);

  const { count: productCount } = await supabase
    .from("products")
    .select("*", { count: "exact", head: true });

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "32px 20px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 28 }}>
        <div>
          <p style={{ margin: 0, color: "#2563eb", fontSize: 12, fontWeight: 700 }}>PREMIUM · HYBRID LAB</p>
          <h1 style={{ margin: "6px 0 4px" }}>Dashboard</h1>
          <p style={{ margin: 0, color: "#64748b", fontSize: 14 }}>{user.email}</p>
        </div>
        <Link href="/" style={{ color: "#64748b", fontSize: 14 }}>← Home</Link>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 28 }}>
        <div style={{ background: "#fff", padding: 20, borderRadius: 12, border: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: 12, color: "#64748b" }}>Organisasi</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{orgs?.length ?? 0}</div>
        </div>
        <div style={{ background: "#fff", padding: 20, borderRadius: 12, border: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: 12, color: "#64748b" }}>Produk</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{productCount ?? 0}</div>
        </div>
        <div style={{ background: "#fff", padding: 20, borderRadius: 12, border: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: 12, color: "#64748b" }}>Supabase</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#059669" }}>Terhubung</div>
        </div>
      </div>

      <section style={{ background: "#fff", padding: 20, borderRadius: 12, border: "1px solid #e2e8f0" }}>
        <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>Tenant lab</h2>
        {!orgs?.length ? (
          <p style={{ color: "#64748b", fontSize: 14, lineHeight: 1.6 }}>
            Belum ada akses organisasi. Setelah migration SQL, tambahkan baris di{" "}
            <code>memberships</code> untuk user Auth kamu (lihat panduan di bawah).
          </p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {orgs.map((o) => (
              <li key={o.id} style={{ marginBottom: 6 }}>
                <strong>{o.name}</strong> <code style={{ fontSize: 12 }}>{o.slug}</code>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p style={{ marginTop: 24, fontSize: 13, color: "#94a3b8" }}>
        Bridge GAS: Step 3 — invoice → posting_jobs → BACKENDengine HYBRID LAB.
      </p>
    </main>
  );
}
