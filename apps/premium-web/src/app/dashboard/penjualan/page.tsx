import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PenjualanPageClient from "./PenjualanPageClient";

export default async function PenjualanPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return <PenjualanPageClient />;
}
