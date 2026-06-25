import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OWNER_ONLY_ROLES } from "@/lib/org/roles";
import { requireUserOrg } from "@/lib/org/require-user-org";
import TimPageClient from "./TimPageClient";

export default async function TimPage() {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch {
    redirect("/login");
  }

  if (!OWNER_ONLY_ROLES.includes(auth.role)) {
    redirect("/dashboard");
  }

  return <TimPageClient />;
}
