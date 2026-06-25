import type { SupabaseClient } from "@supabase/supabase-js";
import { formatOffsetLabel } from "@/lib/proyek/helpers";
import { escapeTelegramHtml } from "@/lib/telegram/bot";
import { formatWibDateLabel, wibTodayIso } from "@/lib/telegram/wib";

export type ProjectReminderTask = {
  taskId: string;
  title: string;
  phase: string;
  deadline: string;
  offsetDays: number;
  projectCode: string;
  projectName: string;
  eventDate: string;
  status: string;
};

export async function fetchProjectReminderTasks(
  supabase: SupabaseClient,
  organizationId: string,
  dateIso = wibTodayIso()
): Promise<ProjectReminderTask[]> {
  const { data: tasks, error } = await supabase
    .from("project_tasks")
    .select(
      "id, title, phase, deadline, offset_days, status, projects!inner(project_code, name, event_date, status, active)"
    )
    .eq("organization_id", organizationId)
    .eq("status", "PENDING")
    .eq("deadline", dateIso);

  if (error || !tasks?.length) return [];

  const rows: ProjectReminderTask[] = [];
  for (const row of tasks) {
    const projectRaw = row.projects as
      | { project_code: string; name: string; event_date: string; status: string; active: boolean }
      | { project_code: string; name: string; event_date: string; status: string; active: boolean }[]
      | null;
    const project = Array.isArray(projectRaw) ? projectRaw[0] : projectRaw;
    if (!project?.active) continue;
    if (project.status === "SELESAI" || project.status === "BATAL") continue;

    rows.push({
      taskId: row.id,
      title: row.title,
      phase: row.phase || "",
      deadline: row.deadline || dateIso,
      offsetDays: Number(row.offset_days) || 0,
      projectCode: project.project_code,
      projectName: project.name,
      eventDate: project.event_date,
      status: row.status
    });
  }

  return rows.sort((a, b) => a.projectCode.localeCompare(b.projectCode));
}

export function formatProjectRemindersMessage(
  orgName: string,
  tasks: ProjectReminderTask[],
  dateIso = wibTodayIso()
): string {
  const dateLabel = formatWibDateLabel(dateIso);
  const name = escapeTelegramHtml(orgName);

  if (!tasks.length) {
    return `📋 <b>${name}</b>\nTidak ada tugas proyek jatuh tempo ${escapeTelegramHtml(dateLabel)}.`;
  }

  const lines = [
    `📋 <b>Reminder proyek — ${name}</b>`,
    `<i>Jatuh tempo ${escapeTelegramHtml(dateLabel)}</i>`,
    ""
  ];

  let currentProject = "";
  for (const task of tasks) {
    if (task.projectCode !== currentProject) {
      currentProject = task.projectCode;
      lines.push(
        `<b>${escapeTelegramHtml(task.projectCode)}</b> — ${escapeTelegramHtml(task.projectName)}`
      );
    }
    const offset = formatOffsetLabel(task.offsetDays);
    const phase = task.phase ? ` · ${escapeTelegramHtml(task.phase)}` : "";
    lines.push(`  • [${offset}] ${escapeTelegramHtml(task.title)}${phase}`);
  }

  lines.push("", "<i>Buka Premium Web → Proyek untuk centang selesai.</i>");
  return lines.join("\n");
}
