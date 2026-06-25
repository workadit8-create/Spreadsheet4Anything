import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUserOrg } from "@/lib/org/require-user-org";
import KasBankPageClient from "./KasBankPageClient";

export default async function KasBankPage() {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch {
    redirect("/login");
  }

  return <KasBankPageClient role={auth.role} />;
}
