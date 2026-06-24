import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PembelianPageClient from "./PembelianPageClient";

export default async function PembelianPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <PembelianPageClient />;
}
