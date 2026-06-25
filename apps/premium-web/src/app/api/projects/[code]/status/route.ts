import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAddon } from "@/lib/org/addons";
import { requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import { normalizeProjectCode, normalizeProjectStatus } from "@/lib/proyek/helpers";

type RouteCtx = { params: Promise<{ code: string }> };

export async function PATCH(request: Request, ctx: RouteCtx) {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
    await requireAddon(supabase, auth.org.id, "project");
  } catch (e) {
    return toOrgAuthResponse(e);
  }

  const { code } = await ctx.params;
  const projectCode = normalizeProjectCode(code);
  const body = await request.json();
  const status = normalizeProjectStatus(body.status);

  const { data, error } = await supabase
    .from("projects")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("organization_id", auth.org.id)
    .eq("project_code", projectCode)
    .select("project_code, status")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Proyek tidak ditemukan" }, { status: 404 });

  return NextResponse.json({
    ok: true,
    projectCode: data.project_code,
    status: data.status
  });
}
