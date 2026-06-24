import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PiutangPageClient from "./PiutangPageClient";

export default async function PiutangPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return <PiutangPageClient />;
}
