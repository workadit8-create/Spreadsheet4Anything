import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardOrgsClient } from "@/components/DashboardOrgsClient";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";

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
    <main className="mx-auto max-w-4xl px-6 py-8">
      <PageHeader
        badge="Premium · Hybrid Lab"
        title="Dashboard"
        description={user.email ?? undefined}
      >
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-700">← Home</Link>
      </PageHeader>

      {debugError && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {debugError}
        </div>
      )}

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <StatCard label="Organisasi" value={orgsFromServer.length} />
        <StatCard label="Produk" value={productCount ?? 0} />
        <StatCard label="Supabase" value="Terhubung" tone="success" />
      </div>

      <div className="space-y-4">
        <Card>
          <h2 className="text-base font-semibold text-slate-900">Master Data</h2>
          <p className="mt-1 text-sm text-slate-500">
            Customer, produk, kas/bank, supplier, kategori pembelian.
          </p>
          <Link
            href="/dashboard/master"
            className="mt-4 inline-flex rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
          >
            Buka Master Data →
          </Link>
        </Card>

        <Card>
          <h2 className="text-base font-semibold text-slate-900">Transaksi</h2>
          <p className="mt-1 text-sm text-slate-500">
            Invoice, piutang, pelunasan — jurnal langsung ke Supabase.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/dashboard/penjualan"
              className="inline-flex rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
            >
              Penjualan →
            </Link>
            <Link
              href="/dashboard/penjualan/riwayat"
              className="inline-flex rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Riwayat →
            </Link>
            <Link
              href="/dashboard/piutang"
              className="inline-flex rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Piutang →
            </Link>
            <Link
              href="/dashboard/jurnal"
              className="inline-flex rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Jurnal →
            </Link>
            <Link
              href="/dashboard/laporan"
              className="inline-flex rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Laporan →
            </Link>
          </div>
        </Card>

        <Card>
          <h2 className="text-base font-semibold text-slate-900">Posting engine</h2>
          <p className="mt-1 text-sm text-slate-500">
            Invoice / pelunasan → <code className="text-xs">posting_jobs</code> →{" "}
            <code className="text-xs">journal_entries</code> (Supabase-only)
          </p>
        </Card>

        <Card>
          <h2 className="text-base font-semibold text-slate-900">Tenant lab</h2>
          {orgsFromServer.length ? (
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {orgsFromServer.map((o) => (
                <li key={o.id}>
                  <strong>{o.name}</strong>{" "}
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{o.slug}</code>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-3">
              <DashboardOrgsClient />
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
