import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserPrimaryOrg } from "@/lib/org/get-user-org";
import { resolveCompanyProfile } from "@/lib/org/company-profile";
import {
  BUSINESS_SECTORS,
  type BusinessSector,
  BUSINESS_SECTOR_LABELS
} from "@/lib/products/inventory-policy";

export async function GET() {
  const supabase = await createClient();
  const org = await getUserPrimaryOrg(supabase);
  if (!org) return NextResponse.json({ error: "Tidak ada organisasi" }, { status: 400 });

  const { data: orgRow, error: orgError } = await supabase
    .from("organizations")
    .select("business_sectors, name")
    .eq("id", org.id)
    .single();

  if (orgError) return NextResponse.json({ error: orgError.message }, { status: 500 });

  const { data: settingsRow } = await supabase
    .from("app_settings")
    .select("settings")
    .eq("organization_id", org.id)
    .maybeSingle();

  const settings = settingsRow?.settings as { business?: Record<string, unknown> } | null;
  const business = settings?.business;
  const company = resolveCompanyProfile(
    { name: String(orgRow.name || org.name), slug: org.slug },
    settings
  );

  const sectors = (orgRow.business_sectors as BusinessSector[] | null) || ["retail"];

  return NextResponse.json({
    orgName: company.orgName,
    companyName: company.name,
    address: company.address,
    phone: company.phone,
    logoUrl: company.logoUrl,
    sectors,
    sectorLabels: sectors.map((s) => BUSINESS_SECTOR_LABELS[s] || s),
    inventoryMode: business?.inventory_mode || "mixed",
    labels: BUSINESS_SECTOR_LABELS
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const org = await getUserPrimaryOrg(supabase);
  if (!org) return NextResponse.json({ error: "Tidak ada organisasi" }, { status: 400 });

  const body = await request.json();
  const rawSectors = Array.isArray(body.sectors) ? body.sectors : [];
  const sectors = rawSectors.filter((s: string) =>
    BUSINESS_SECTORS.includes(s as BusinessSector)
  ) as BusinessSector[];

  if (!sectors.length) {
    return NextResponse.json({ error: "Pilih minimal satu sektor usaha" }, { status: 400 });
  }

  const companyName = String(body.company_name || body.companyName || "").trim();
  if (!companyName) {
    return NextResponse.json({ error: "Nama perusahaan wajib diisi" }, { status: 400 });
  }

  const address = String(body.address || "").trim();
  const phone = String(body.phone || "").trim();
  const inventoryMode = String(body.inventory_mode || "mixed");

  const { error: orgError } = await supabase
    .from("organizations")
    .update({
      name: companyName,
      business_sectors: sectors,
      updated_at: new Date().toISOString()
    })
    .eq("id", org.id);

  if (orgError) return NextResponse.json({ error: orgError.message }, { status: 500 });

  const { data: existing } = await supabase
    .from("app_settings")
    .select("settings")
    .eq("organization_id", org.id)
    .maybeSingle();

  const mergedSettings = {
    ...((existing?.settings as Record<string, unknown>) || {}),
    business: {
      ...(((existing?.settings as { business?: Record<string, unknown> })?.business) || {}),
      sectors,
      inventory_mode: inventoryMode,
      company_name: companyName,
      address,
      phone
    }
  };

  const { error: settingsError } = await supabase.from("app_settings").upsert({
    organization_id: org.id,
    settings: mergedSettings,
    updated_at: new Date().toISOString()
  });

  if (settingsError) return NextResponse.json({ error: settingsError.message }, { status: 500 });

  return NextResponse.json({
    orgName: companyName,
    companyName,
    address,
    phone,
    sectors,
    sectorLabels: sectors.map((s) => BUSINESS_SECTOR_LABELS[s]),
    inventoryMode
  });
}
