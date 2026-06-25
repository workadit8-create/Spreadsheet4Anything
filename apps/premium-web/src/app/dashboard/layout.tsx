import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchCompanyProfile } from "@/lib/org/company-profile";
import { requireUserOrg } from "@/lib/org/require-user-org";
import { AppShell } from "@/components/layout/AppShell";
import { DashboardRouteGuard } from "@/components/layout/DashboardRouteGuard";
import { isDemoOrg } from "@/lib/org/demo-reset";
import { fetchOrgAddons } from "@/lib/org/addons";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch {
    redirect("/login");
  }
  const { user, org, role, isPlatformAdmin } = auth;
  const company = await fetchCompanyProfile(supabase, org);
  const addons = await fetchOrgAddons(supabase, org.id);

  return (
    <AppShell
      userEmail={user.email}
      orgName={org.name}
      orgLogoUrl={company.logoUrl}
      role={role}
      isPlatformAdmin={isPlatformAdmin}
      isDemo={isDemoOrg(org)}
      addons={addons}
    >
      <DashboardRouteGuard role={role}>{children}</DashboardRouteGuard>
    </AppShell>
  );
}
