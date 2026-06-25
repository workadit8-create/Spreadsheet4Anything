import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAddon } from "@/lib/org/addons";
import { requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import { buildProjectLrDetail } from "@/lib/proyek/lr-report";
import { normalizeProjectCode } from "@/lib/proyek/helpers";

type RouteCtx = { params: Promise<{ code: string }> };

export async function GET(request: Request, ctx: RouteCtx) {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
    await requireAddon(supabase, auth.org.id, "project");
  } catch (e) {
    return toOrgAuthResponse(e);
  }

  const { code } = await ctx.params;
  const url = new URL(request.url);

  try {
    const detail = await buildProjectLrDetail(
      supabase,
      auth.org.id,
      normalizeProjectCode(code),
      url.searchParams.get("start") || "",
      url.searchParams.get("end") || ""
    );
    return NextResponse.json(detail);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Gagal memuat detail" },
      { status: 400 }
    );
  }
}
