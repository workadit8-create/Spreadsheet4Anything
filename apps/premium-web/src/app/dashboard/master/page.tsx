import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUserOrg } from "@/lib/org/require-user-org";
import MasterDataClient from "./MasterDataClient";

export default async function MasterDataPage() {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch {
    redirect("/login");
  }

  return <MasterDataClient role={auth.role} />;
}
