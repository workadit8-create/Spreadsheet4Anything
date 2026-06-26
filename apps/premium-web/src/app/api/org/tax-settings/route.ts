import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AUDIT_ACTIONS, auditFromContext, writeAuditLog } from "@/lib/audit/log";
import { requireOwnerRole, requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import {
  fetchOrgTaxSettings,
  saveOrgTaxSettings,
  type TaxActiveType,
  type TaxSettingsPatch
} from "@/lib/org/tax-settings";

export async function GET() {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch (e) {
    return toOrgAuthResponse(e);
  }

  const tax = await fetchOrgTaxSettings(supabase, auth.org.id);
  return NextResponse.json({ tax, canEdit: auth.role === "owner" });
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

  let body: TaxSettingsPatch & { activeType?: TaxActiveType } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const { tax, error } = await saveOrgTaxSettings(supabase, auth.org.id, body);
  if (error) return NextResponse.json({ error }, { status: 500 });

  await writeAuditLog(
    supabase,
    auditFromContext(auth, AUDIT_ACTIONS.orgTaxUpdate, {
      resourceType: "organization",
      resourceId: auth.org.id,
      metadata: {
        activeType: tax.activeType,
        pkpEnabled: tax.ppn.pkpEnabled,
        pbEnabled: tax.pb.enabled,
        pbRatePercent: tax.pb.ratePercent
      },
      request
    })
  );

  return NextResponse.json({ tax, canEdit: true });
}
