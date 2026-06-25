import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PurchaseRequestPageClient from "./PurchaseRequestPageClient";

export default async function PurchaseRequestPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <PurchaseRequestPageClient />;
}
