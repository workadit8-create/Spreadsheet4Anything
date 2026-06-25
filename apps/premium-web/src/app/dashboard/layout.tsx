import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserPrimaryOrg } from "@/lib/org/get-user-org";
import { AppShell } from "@/components/layout/AppShell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const org = await getUserPrimaryOrg(supabase);

  return (
    <AppShell userEmail={user.email} orgName={org?.name}>
      {children}
    </AppShell>
  );
}
