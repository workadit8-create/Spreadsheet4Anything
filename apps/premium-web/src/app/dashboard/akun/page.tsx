import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUserOrg } from "@/lib/org/require-user-org";
import AkunPageClient from "./AkunPageClient";

export default async function AkunPage() {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch {
    redirect("/login");
  }

  if (!auth.user.email) {
    redirect("/dashboard");
  }

  return <AkunPageClient email={auth.user.email} role={auth.role} />;
}
