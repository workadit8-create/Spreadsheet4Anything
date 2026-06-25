import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DashboardPageClient from "./DashboardPageClient";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return <DashboardPageClient userEmail={user.email} />;
}
