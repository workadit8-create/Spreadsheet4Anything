import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrgRow } from "@/lib/org/get-user-org";

export type OnboardingStep = {
  id: string;
  title: string;
  description: string;
  href: string;
  done: boolean;
};

export type OnboardingStatus = {
  org: Pick<OrgRow, "id" | "name" | "slug">;
  steps: OnboardingStep[];
  completedCount: number;
  totalCount: number;
  complete: boolean;
};

export async function fetchOnboardingStatus(
  supabase: SupabaseClient,
  org: OrgRow
): Promise<OnboardingStatus> {
  const [
    settingsRes,
    coaRes,
    kasRes,
    customerRes,
    journalRes,
    postedSalesRes,
    warehouseRes
  ] = await Promise.all([
    supabase.from("app_settings").select("settings").eq("organization_id", org.id).maybeSingle(),
    supabase
      .from("coa_accounts")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.id)
      .eq("active", true),
    supabase
      .from("cash_bank_accounts")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.id)
      .eq("active", true),
    supabase
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.id)
      .eq("active", true),
    supabase
      .from("journal_entries")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.id),
    supabase
      .from("sales_orders")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.id)
      .eq("status", "POSTED"),
    supabase
      .from("warehouses")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.id)
  ]);

  const business = (
    settingsRes.data?.settings as { business?: Record<string, unknown> } | null | undefined
  )?.business;

  const profileDone = Boolean(
    String(business?.company_name || "").trim() ||
      String(business?.address || "").trim() ||
      String(business?.phone || "").trim()
  );

  const coaCount = coaRes.count ?? 0;
  const kasCount = kasRes.count ?? 0;
  const customerCount = customerRes.count ?? 0;
  const journalCount = journalRes.count ?? 0;
  const postedSalesCount = postedSalesRes.count ?? 0;
  const warehouseCount = warehouseRes.count ?? 0;

  const steps: OnboardingStep[] = [
    {
      id: "profile",
      title: "Profil usaha",
      description: "Nama, alamat, telepon (dan logo) untuk sidebar & cetak dokumen.",
      href: "/dashboard/master",
      done: profileDone
    },
    {
      id: "coa",
      title: "Chart of Accounts",
      description: "Buka Master → COA sekali agar akun default terisi otomatis.",
      href: "/dashboard/master",
      done: coaCount >= 10
    },
    {
      id: "kas_bank",
      title: "Rekening kas & bank",
      description: "Minimal satu rekening (KAS KECIL, BANK BCA, …) terhubung ke akun COA.",
      href: "/dashboard/master",
      done: kasCount >= 1
    },
    {
      id: "warehouse",
      title: "Gudang default",
      description: "Gudang utama untuk penjualan/pembelian (otomatis saat onboarding SQL).",
      href: "/dashboard/master",
      done: warehouseCount >= 1
    },
    {
      id: "opening",
      title: "Saldo awal",
      description: "Jurnal manual saldo awal, lalu alokasi ke rekening di Kas & Bank.",
      href: "/dashboard/jurnal/manual",
      done: journalCount >= 1
    },
    {
      id: "customer",
      title: "Customer pertama",
      description: "Satu customer untuk uji invoice proper.",
      href: "/dashboard/master",
      done: customerCount >= 1
    },
    {
      id: "smoke",
      title: "Smoke test invoice",
      description: "Buat invoice → posting jurnal → cek di Jurnal / Laporan.",
      href: "/dashboard/penjualan",
      done: postedSalesCount >= 1
    }
  ];

  const completedCount = steps.filter((s) => s.done).length;

  return {
    org: { id: org.id, name: org.name, slug: org.slug },
    steps,
    completedCount,
    totalCount: steps.length,
    complete: completedCount === steps.length
  };
}
