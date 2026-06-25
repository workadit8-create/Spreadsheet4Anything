import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAddon } from "@/lib/org/addons";
import { requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import { normalizeProjectCode, rowToProjectDto } from "@/lib/proyek/helpers";
import type { ProjectRow } from "@/lib/proyek/types";

type RouteCtx = { params: Promise<{ code: string }> };

export async function GET(_request: Request, ctx: RouteCtx) {
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

  const { data, error } = await supabase
    .from("projects")
    .select("*, customers(name)")
    .eq("organization_id", auth.org.id)
    .eq("project_code", projectCode)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Proyek tidak ditemukan" }, { status: 404 });

  return NextResponse.json({ project: rowToProjectDto(data as ProjectRow) });
}
