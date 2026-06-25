import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserPrimaryOrg } from "@/lib/org/get-user-org";
import { fetchCompanyProfile } from "@/lib/org/company-profile";
import { AppShell } from "@/components/layout/AppShell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const org = await getUserPrimaryOrg(supabase);
  const company = org ? await fetchCompanyProfile(supabase, org) : null;

  return (
    <AppShell userEmail={user.email} orgName={org?.name} orgLogoUrl={company?.logoUrl}>
      {children}
    </AppShell>
  );
}
