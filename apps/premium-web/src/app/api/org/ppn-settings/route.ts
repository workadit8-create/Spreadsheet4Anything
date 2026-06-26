import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AUDIT_ACTIONS, auditFromContext, writeAuditLog } from "@/lib/audit/log";
import { requireOwnerRole, requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import {
  buildPpnSettingsPatch,
  fetchOrgPpnSettings,
  resolvePpnSettings
} from "@/lib/org/ppn-settings";

export async function GET() {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch (e) {
    return toOrgAuthResponse(e);
  }

  const ppn = await fetchOrgPpnSettings(supabase, auth.org.id);
  return NextResponse.json({ ppn, canEdit: auth.role === "owner" });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch (e) {
    return toOrgAuthResponse(e);
  }
  requireOwnerRole(auth.role);

  let body: { pkpEnabled?: boolean; priceIncludesPpn?: boolean };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const { data: existing } = await supabase
    .from("app_settings")
    .select("settings")
    .eq("organization_id", auth.org.id)
    .maybeSingle();

  const current = resolvePpnSettings(
    existing?.settings as { ppn?: Record<string, unknown> } | undefined
  );

  const nextPkp =
    body.pkpEnabled !== undefined ? Boolean(body.pkpEnabled) : current.pkpEnabled;
  const nextIncludes =
    body.priceIncludesPpn !== undefined
      ? Boolean(body.priceIncludesPpn)
      : current.priceIncludesPpn;

  const mergedSettings = {
    ...((existing?.settings as Record<string, unknown>) || {}),
    ppn: {
      ...buildPpnSettingsPatch({
        pkpEnabled: nextPkp,
        priceIncludesPpn: nextIncludes
      })
    }
  };

  const { error } = await supabase.from("app_settings").upsert({
    organization_id: auth.org.id,
    settings: mergedSettings,
    updated_at: new Date().toISOString()
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ppn = resolvePpnSettings(mergedSettings);

  await writeAuditLog(
    supabase,
    auditFromContext(auth, AUDIT_ACTIONS.orgPpnUpdate, {
      resourceType: "organization",
      resourceId: auth.org.id,
      metadata: { pkpEnabled: ppn.pkpEnabled, priceIncludesPpn: ppn.priceIncludesPpn },
      request
    })
  );

  return NextResponse.json({ ppn, canEdit: true });
}
