import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUserOrg } from "@/lib/org/require-user-org";
import RiwayatPenjualanClient from "./RiwayatPenjualanClient";

export default async function RiwayatPenjualanPage() {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch {
    redirect("/login");
  }

  return <RiwayatPenjualanClient role={auth.role} />;
}
