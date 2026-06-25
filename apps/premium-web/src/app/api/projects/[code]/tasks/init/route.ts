import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAddon } from "@/lib/org/addons";
import { requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import { computeTaskDeadline, normalizeProjectCode } from "@/lib/proyek/helpers";
import { PROJECT_TASK_TEMPLATES } from "@/lib/proyek/templates";

type RouteCtx = { params: Promise<{ code: string }> };

export async function POST(request: Request, ctx: RouteCtx) {
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
  const templateKey = String(body.template_key || body.templateKey || "").trim();

  const template = PROJECT_TASK_TEMPLATES[templateKey];
  if (!template) {
    return NextResponse.json({ error: "Template tidak dikenal" }, { status: 400 });
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, event_date")
    .eq("organization_id", auth.org.id)
    .eq("project_code", projectCode)
    .maybeSingle();

  if (projectError) return NextResponse.json({ error: projectError.message }, { status: 500 });
  if (!project) return NextResponse.json({ error: "Proyek tidak ditemukan" }, { status: 404 });

  const { count } = await supabase
    .from("project_tasks")
    .select("id", { count: "exact", head: true })
    .eq("project_id", project.id);

  if ((count || 0) > 0) {
    return NextResponse.json(
      { error: "Checklist sudah ada — hapus manual jika ingin reset template" },
      { status: 409 }
    );
  }

  const rows = template.items.map((item, index) => ({
    organization_id: auth.org.id,
    project_id: project.id,
    template_key: templateKey,
    phase: item.phase,
    title: item.title,
    offset_days: item.offsetDays,
    deadline: computeTaskDeadline(project.event_date, item.offsetDays),
    status: "PENDING",
    sort_order: index + 1
  }));

  const { error } = await supabase.from("project_tasks").insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, created: rows.length, templateKey });
}
