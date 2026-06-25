import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { mapAuditLogRow } from "@/lib/audit/log";
import { requirePostingRole, requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";

export async function GET(request: Request) {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
    requirePostingRole(auth.role);
  } catch (e) {
    return toOrgAuthResponse(e);
  }

  const url = new URL(request.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 50)));
  const before = url.searchParams.get("before");
  const action = url.searchParams.get("action");

  let query = supabase
    .from("audit_log")
    .select("*")
    .eq("organization_id", auth.org.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (before) {
    query = query.lt("created_at", before);
  }
  if (action) {
    query = query.eq("action", action);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const entries = (data || []).map(mapAuditLogRow);
  const nextBefore =
    entries.length === limit ? entries[entries.length - 1]?.createdAt ?? null : null;

  return NextResponse.json({ entries, nextBefore });
}
