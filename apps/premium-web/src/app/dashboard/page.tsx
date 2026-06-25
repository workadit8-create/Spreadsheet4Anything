import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUserOrg } from "@/lib/org/require-user-org";
import DashboardPageClient from "./DashboardPageClient";

export default async function DashboardPage() {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch {
    redirect("/login");
  }

  return <DashboardPageClient userEmail={auth.user.email} role={auth.role} />;
}
