import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchCompanyProfile } from "@/lib/org/company-profile";
import { requireUserOrg } from "@/lib/org/require-user-org";
import { AppShell } from "@/components/layout/AppShell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch {
    redirect("/login");
  }
  const { user, org } = auth;
  const company = await fetchCompanyProfile(supabase, org);

  return (
    <AppShell userEmail={user.email} orgName={org.name} orgLogoUrl={company.logoUrl}>
      {children}
    </AppShell>
  );
}
