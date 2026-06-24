import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import RiwayatPenjualanClient from "./RiwayatPenjualanClient";

export default async function RiwayatPenjualanPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return <RiwayatPenjualanClient />;
}
