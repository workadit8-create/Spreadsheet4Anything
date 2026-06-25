import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUserOrg } from "@/lib/org/require-user-org";
import RiwayatPembelianClient from "./RiwayatPembelianClient";

export default async function RiwayatPembelianPage() {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch {
    redirect("/login");
  }

  return <RiwayatPembelianClient role={auth.role} />;
}
