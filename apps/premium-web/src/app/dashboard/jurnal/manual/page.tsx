import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import JurnalManualPageClient from "./JurnalManualPageClient";

export default async function JurnalManualPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return <JurnalManualPageClient />;
}
