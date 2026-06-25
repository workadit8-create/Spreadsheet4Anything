import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAddon } from "@/lib/org/addons";
import { requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import { rowToProjectDto } from "@/lib/proyek/helpers";
import type { ProjectRow } from "@/lib/proyek/types";

export async function GET() {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
    await requireAddon(supabase, auth.org.id, "project");
  } catch (e) {
    return toOrgAuthResponse(e);
  }

  const { data, error } = await supabase
    .from("projects")
    .select("*, customers(name)")
    .eq("organization_id", auth.org.id)
    .eq("active", true)
    .order("event_date", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    options: (data || [])
      .filter((row) => {
        const status = String(row.status || "").toUpperCase();
        return status !== "SELESAI" && status !== "BATAL";
      })
      .map((row) => {
      const dto = rowToProjectDto(row as ProjectRow);
      return {
        projectCode: dto.projectCode,
        label: `${dto.projectCode} — ${dto.name}${dto.eventDate ? ` (${dto.eventDate})` : ""}`,
        name: dto.name,
        customerName: dto.customerName,
        eventDate: dto.eventDate,
        status: dto.status
      };
    })
  });
}
