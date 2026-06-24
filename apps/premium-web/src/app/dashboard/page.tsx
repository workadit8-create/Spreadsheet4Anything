import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardOrgsClient } from "@/components/DashboardOrgsClient";

type OrgRow = { id: string; slug: string; name: string };

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: sessionData } = await supabase.auth.getSession();
  const hasSession = Boolean(sessionData.session?.access_token);

  const { count: productCount, error: productError } = await supabase
    .from("products")
    .select("*", { count: "exact", head: true });

  const { data: orgsRpc, error: orgRpcError } = await supabase.rpc("get_my_organizations");

  let orgsFromServer: OrgRow[] = (orgsRpc as OrgRow[] | null) ?? [];

  if (!orgsFromServer.length && !orgRpcError) {
    const { data: memberships, error: memError } = await supabase
      .from("memberships")
      .select("organization_id, organizations(id, slug, name)");

    if (!memError && memberships?.length) {
      orgsFromServer = memberships
        .map((m) => {
          const raw = m.organizations as OrgRow | OrgRow[] | null;
          if (!raw) return null;
          return Array.isArray(raw) ? raw[0] : raw;
        })
        .filter((o): o is OrgRow => o != null && o.id != null);
    }
  }

  const debugError =
    orgRpcError?.message ||
    productError?.message ||
    (!hasSession ? "Session JWT tidak ada di cookie — login ulang" : null);

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "32px 20px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 28 }}>
        <div>
          <p style={{ margin: 0, color: "#2563eb", fontSize: 12, fontWeight: 700 }}>PREMIUM · HYBRID LAB</p>
          <h1 style={{ margin: "6px 0 4px" }}>Dashboard</h1>
          <p style={{ margin: 0, color: "#64748b", fontSize: 14 }}>{user.email}</p>
          <p style={{ margin: "4px 0 0", color: "#94a3b8", fontSize: 11 }}>user id: {user.id}</p>
        </div>
        <Link href="/" style={{ color: "#64748b", fontSize: 14 }}>← Home</Link>
      </header>

      {debugError && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13, color: "#991b1b" }}>
          Server query: {debugError}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 28 }}>
        <div style={{ background: "#fff", padding: 20, borderRadius: 12, border: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: 12, color: "#64748b" }}>Organisasi</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{orgsFromServer.length}</div>
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
        {orgsFromServer.length ? (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {orgsFromServer.map((o) => (
              <li key={o.id} style={{ marginBottom: 6 }}>
                <strong>{o.name}</strong> <code style={{ fontSize: 12 }}>{o.slug}</code>
              </li>
            ))}
          </ul>
        ) : (
          <DashboardOrgsClient />
        )}
      </section>

      <p style={{ marginTop: 24, fontSize: 13, color: "#94a3b8" }}>
        Bridge GAS: Step 3 — invoice → posting_jobs → BACKENDengine HYBRID LAB.
      </p>
    </main>
  );
}
