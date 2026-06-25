import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LaporanPageClient from "./LaporanPageClient";

export default async function LaporanPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return <LaporanPageClient />;
}
