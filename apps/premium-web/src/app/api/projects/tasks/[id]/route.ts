import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAddon } from "@/lib/org/addons";
import { requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import { normalizeTaskStatus } from "@/lib/proyek/helpers";

type RouteCtx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: RouteCtx) {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
    await requireAddon(supabase, auth.org.id, "project");
  } catch (e) {
    return toOrgAuthResponse(e);
  }

  const { id } = await ctx.params;
  const body = await request.json();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.status !== undefined) {
    const status = normalizeTaskStatus(body.status);
    patch.status = status;
    patch.completed_at = status === "DONE" ? new Date().toISOString() : null;
  }
  if (body.pic !== undefined) patch.pic = String(body.pic || "").trim() || null;
  if (body.notes !== undefined || body.catatan !== undefined) {
    patch.notes = String(body.notes || body.catatan || "").trim() || null;
  }

  const { data, error } = await supabase
    .from("project_tasks")
    .update(patch)
    .eq("organization_id", auth.org.id)
    .eq("id", id)
    .select("id, status")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Task tidak ditemukan" }, { status: 404 });

  return NextResponse.json({ ok: true, id: data.id, status: data.status });
}
