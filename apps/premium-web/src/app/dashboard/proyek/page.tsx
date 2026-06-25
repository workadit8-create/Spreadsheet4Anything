import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchOrgAddons, isAddonEnabled } from "@/lib/org/addons";
import { requireUserOrg } from "@/lib/org/require-user-org";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";

export default async function ProyekPage() {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch {
    redirect("/login");
  }

  const addons = await fetchOrgAddons(supabase, auth.org.id);
  if (!isAddonEnabled(addons, "project")) {
    redirect("/dashboard");
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <PageHeader
        badge="Add-on · Manajemen Proyek"
        title="Proyek"
        description="Modul event & proyek catering — fase implementasi berikutnya."
      />
      <Card className="p-6">
        <p className="text-sm text-slate-600">
          Kerangka add-on aktif. Fitur lengkap (daftar proyek, biaya, timeline) menyusul di fase 2.
        </p>
        <p className="mt-3 text-xs text-slate-400">
          Organisasi: {auth.org.name} · add-on <code className="rounded bg-slate-100 px-1">project</code> aktif
        </p>
      </Card>
    </main>
  );
}
