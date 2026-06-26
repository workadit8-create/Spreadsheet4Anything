import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUserOrg } from "@/lib/org/require-user-org";
import PpnPageClient from "./PpnPageClient";

export default async function PpnPage() {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch {
    redirect("/login");
  }

  return <PpnPageClient role={auth.role} />;
}
