import { NextResponse } from "next/server";
import { wibTodayIso } from "@/lib/date/wib";
import { createClient } from "@/lib/supabase/server";
import { requireAddon } from "@/lib/org/addons";
import { requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import { normalizeProjectCode, rowToTaskDto } from "@/lib/proyek/helpers";

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

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, project_code, event_date")
    .eq("organization_id", auth.org.id)
    .eq("project_code", projectCode)
    .maybeSingle();

  if (projectError) return NextResponse.json({ error: projectError.message }, { status: 500 });
  if (!project) return NextResponse.json({ error: "Proyek tidak ditemukan" }, { status: 404 });

  const { data: tasks, error } = await supabase
    .from("project_tasks")
    .select("*")
    .eq("project_id", project.id)
    .order("sort_order", { ascending: true })
    .order("offset_days", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const taskDtos = (tasks || []).map(rowToTaskDto);
  const today = wibTodayIso();
  let done = 0;
  let pending = 0;
  let overdue = 0;
  for (const t of taskDtos) {
    if (t.status === "DONE" || t.status === "NA") done += 1;
    else {
      pending += 1;
      if (t.deadline && t.deadline < today) overdue += 1;
    }
  }
  const total = taskDtos.length;
  const progressPct = total > 0 ? Math.round((done / total) * 1000) / 10 : 0;

  return NextResponse.json({
    projectCode: project.project_code,
    eventDate: project.event_date,
    tasks: taskDtos,
    progress: { total, done, pending, overdue, progressPct }
  });
}
