import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { fetchOrgAddons, isAddonEnabled } from "@/lib/org/addons";
import { requireUserOrg } from "@/lib/org/require-user-org";
import MasterDataClient from "./MasterDataClient";

export default async function MasterDataPage() {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch {
    redirect("/login");
  }

  const addons = await fetchOrgAddons(supabase, auth.org.id);

  return (
    <Suspense fallback={<main className="mx-auto max-w-5xl px-6 py-8 text-sm text-slate-500">Memuat master data…</main>}>
      <MasterDataClient
        role={auth.role}
        outletAddonEnabled={isAddonEnabled(addons, "outlet")}
      />
    </Suspense>
  );
}
