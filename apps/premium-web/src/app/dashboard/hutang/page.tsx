import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import HutangPageClient from "./HutangPageClient";

export default async function HutangPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <HutangPageClient />;
}
