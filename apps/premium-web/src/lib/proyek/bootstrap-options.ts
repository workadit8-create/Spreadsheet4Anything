import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchOrgAddons, isAddonEnabled } from "@/lib/org/addons";
import { rowToProjectDto } from "@/lib/proyek/helpers";
import type { ProjectRow } from "@/lib/proyek/types";

export type ProjectOption = {
  projectCode: string;
  label: string;
};

export type ProjectBootstrap = {
  enabled: boolean;
  options: ProjectOption[];
};

export async function fetchProjectBootstrap(
  supabase: SupabaseClient,
  orgId: string
): Promise<ProjectBootstrap> {
  const addons = await fetchOrgAddons(supabase, orgId);
  if (!isAddonEnabled(addons, "project")) {
    return { enabled: false, options: [] };
  }

  const { data, error } = await supabase
    .from("projects")
    .select("*, customers(name)")
    .eq("organization_id", orgId)
    .eq("active", true)
    .order("event_date", { ascending: true });

  if (error) throw new Error(error.message);

  const options = (data || [])
    .filter((row) => {
      const status = String(row.status || "").toUpperCase();
      return status !== "SELESAI" && status !== "BATAL";
    })
    .map((row) => {
      const dto = rowToProjectDto(row as ProjectRow);
      return {
        projectCode: dto.projectCode,
        label: `${dto.projectCode} — ${dto.name}${dto.eventDate ? ` (${dto.eventDate})` : ""}`
      };
    });

  return { enabled: true, options };
}
