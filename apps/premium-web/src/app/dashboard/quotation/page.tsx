import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import QuotationPageClient from "./QuotationPageClient";

export default async function QuotationPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <QuotationPageClient />;
}
