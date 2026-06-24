import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import RiwayatPembelianClient from "./RiwayatPembelianClient";

export default async function RiwayatPembelianPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <RiwayatPembelianClient />;
}
