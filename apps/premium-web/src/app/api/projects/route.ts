import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAddon } from "@/lib/org/addons";
import { requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import {
  computeTaskDeadline,
  generateProjectCode,
  normalizeProjectCode,
  normalizeProjectStatus,
  rowToProjectDto,
  validateProjectPayload
} from "@/lib/proyek/helpers";
import type { ProjectRow } from "@/lib/proyek/types";

export async function GET(request: Request) {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
    await requireAddon(supabase, auth.org.id, "project");
  } catch (e) {
    return toOrgAuthResponse(e);
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "";
  const search = (url.searchParams.get("search") || "").trim().toLowerCase();
  const upcomingOnly = url.searchParams.get("upcoming") === "1";
  const activeOnly = url.searchParams.get("active") !== "0";

  let query = supabase
    .from("projects")
    .select("*, customers(name)")
    .eq("organization_id", auth.org.id)
    .order("event_date", { ascending: true })
    .order("project_code", { ascending: true });

  if (activeOnly) query = query.eq("active", true);
  if (status && status !== "ALL") query = query.eq("status", status.toUpperCase());

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let rows = (data || []).map((row) => rowToProjectDto(row as ProjectRow));

  if (upcomingOnly) {
    rows = rows.filter((p) => {
      if (!p.eventDate) return false;
      const ev = new Date(`${p.eventDate}T12:00:00`);
      if (Number.isNaN(ev.getTime()) || ev < today) return false;
      return p.status !== "SELESAI" && p.status !== "BATAL";
    });
  }

  if (search) {
    rows = rows.filter((p) => {
      const blob = [p.projectCode, p.name, p.customerName, p.location, p.pic, p.quotationNo]
        .join(" ")
        .toLowerCase();
      return blob.includes(search);
    });
  }

  return NextResponse.json({ rows });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
    await requireAddon(supabase, auth.org.id, "project");
  } catch (e) {
    return toOrgAuthResponse(e);
  }

  const body = await request.json();
  try {
    validateProjectPayload({
      name: body.name,
      customerId: body.customer_id || body.customerId,
      eventDate: body.event_date || body.eventDate
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Data tidak valid" },
      { status: 400 }
    );
  }

  const existingCode = normalizeProjectCode(body.project_code || body.projectCode || "");
  const payload = {
    name: String(body.name).trim(),
    customer_id: body.customer_id || body.customerId,
    event_date: String(body.event_date || body.eventDate).slice(0, 10),
    location: String(body.location || "").trim() || null,
    pax: Number(body.pax) || 0,
    status: normalizeProjectStatus(body.status || "DRAFT"),
    pic: String(body.pic || "").trim() || null,
    notes: String(body.notes || body.catatan || "").trim() || null,
    quotation_no: String(body.quotation_no || body.quotationNo || "")
      .trim()
      .toUpperCase() || null,
    active: body.active !== false,
    updated_at: new Date().toISOString()
  };

  if (existingCode) {
    const { data: updated, error } = await supabase
      .from("projects")
      .update(payload)
      .eq("organization_id", auth.org.id)
      .eq("project_code", existingCode)
      .select("*, customers(name)")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!updated) return NextResponse.json({ error: "Proyek tidak ditemukan" }, { status: 404 });

    if (payload.event_date) {
      const { data: tasks } = await supabase
        .from("project_tasks")
        .select("id, offset_days")
        .eq("project_id", updated.id);
      for (const task of tasks || []) {
        const deadline = computeTaskDeadline(
          payload.event_date,
          Number(task.offset_days) || 0
        );
        await supabase.from("project_tasks").update({ deadline }).eq("id", task.id);
      }
    }

    return NextResponse.json({
      ok: true,
      project: rowToProjectDto(updated as ProjectRow)
    });
  }

  const projectCode = await generateProjectCode(supabase, auth.org.id);
  const { data: created, error } = await supabase
    .from("projects")
    .insert({
      organization_id: auth.org.id,
      project_code: projectCode,
      ...payload
    })
    .select("*, customers(name)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    project: rowToProjectDto(created as ProjectRow)
  });
}
