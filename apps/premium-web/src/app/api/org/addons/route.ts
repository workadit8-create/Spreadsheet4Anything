import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  ADDON_KEYS,
  fetchOrgAddons,
  isAddonKey,
  toAddonInfoList
} from "@/lib/org/addons";
import { requirePlatformAdmin, requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";

export async function GET() {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch (e) {
    return toOrgAuthResponse(e);
  }

  const map = await fetchOrgAddons(supabase, auth.org.id);
  return NextResponse.json({
    addons: toAddonInfoList(map),
    canManageAddons: auth.isPlatformAdmin
  });
}

/** Toggle add-on — hanya admin platform (bukan owner client). */
export async function PATCH(request: Request) {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
    requirePlatformAdmin(auth);
  } catch (e) {
    return toOrgAuthResponse(e);
  }

  const body = await request.json();
  const key = String(body.addon_key || body.addonKey || "");
  if (!isAddonKey(key)) {
    return NextResponse.json({ error: "Add-on tidak dikenal" }, { status: 400 });
  }

  const enabled = body.enabled === true;
  const orgId = String(body.organization_id || body.organizationId || auth.org.id);

  const { error } = await supabase.from("tenant_addons").upsert(
    {
      organization_id: orgId,
      addon_key: key,
      enabled,
      updated_at: new Date().toISOString()
    },
    { onConflict: "organization_id,addon_key" }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const map = await fetchOrgAddons(supabase, orgId);
  return NextResponse.json({
    ok: true,
    addons: toAddonInfoList(map),
    allowedKeys: ADDON_KEYS
  });
}
