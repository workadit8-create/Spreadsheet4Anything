import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PROJECT_STATUSES,
  type ProjectDto,
  type ProjectRow,
  type ProjectStatus,
  type ProjectTaskDto,
  type TaskStatus,
  TASK_STATUSES
} from "@/lib/proyek/types";

export function normalizeProjectCode(value: string): string {
  return String(value || "").trim().toUpperCase();
}

export function normalizeProjectStatus(value: string): ProjectStatus {
  const s = String(value || "").trim().toUpperCase();
  return (PROJECT_STATUSES as readonly string[]).includes(s) ? (s as ProjectStatus) : "DRAFT";
}

export function normalizeTaskStatus(value: string): TaskStatus {
  const s = String(value || "").trim().toUpperCase();
  return (TASK_STATUSES as readonly string[]).includes(s) ? (s as TaskStatus) : "PENDING";
}

export function formatOffsetLabel(offsetDays: number): string {
  if (offsetDays === 0) return "H-day";
  if (offsetDays > 0) return `H+${offsetDays}`;
  return `H${offsetDays}`;
}

export function computeTaskDeadline(eventDate: string, offsetDays: number): string {
  if (!eventDate) return "";
  const base = new Date(`${eventDate.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(base.getTime())) return "";
  base.setDate(base.getDate() + offsetDays);
  return base.toISOString().slice(0, 10);
}

export function customerNameFromRow(row: ProjectRow): string {
  const cust = row.customers;
  if (!cust) return "";
  if (Array.isArray(cust)) return cust[0]?.name || "";
  return cust.name || "";
}

export function rowToProjectDto(row: ProjectRow): ProjectDto {
  return {
    id: row.id,
    projectCode: row.project_code,
    name: row.name,
    customerId: row.customer_id,
    customerName: customerNameFromRow(row),
    eventDate: row.event_date,
    location: row.location || "",
    pax: Number(row.pax) || 0,
    status: normalizeProjectStatus(row.status),
    pic: row.pic || "",
    notes: row.notes || "",
    quotationNo: row.quotation_no || "",
    active: row.active !== false
  };
}

export function rowToTaskDto(row: {
  id: string;
  project_id: string;
  template_key: string | null;
  phase: string | null;
  title: string;
  offset_days: number;
  deadline: string | null;
  pic: string | null;
  status: string;
  notes: string | null;
  sort_order: number;
  completed_at: string | null;
}): ProjectTaskDto {
  const offsetDays = Number(row.offset_days) || 0;
  return {
    id: row.id,
    projectId: row.project_id,
    templateKey: row.template_key || "",
    phase: row.phase || "",
    title: row.title,
    offsetDays,
    offsetLabel: formatOffsetLabel(offsetDays),
    deadline: row.deadline || "",
    pic: row.pic || "",
    status: normalizeTaskStatus(row.status),
    notes: row.notes || "",
    sortOrder: Number(row.sort_order) || 0,
    completedAt: row.completed_at ? row.completed_at.slice(0, 10) : ""
  };
}

export async function generateProjectCode(
  supabase: SupabaseClient,
  orgId: string
): Promise<string> {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const prefix = `PRJ-${y}${m}${day}-`;

  const { data } = await supabase
    .from("projects")
    .select("project_code")
    .eq("organization_id", orgId)
    .like("project_code", `${prefix}%`)
    .order("project_code", { ascending: false })
    .limit(1);

  let seq = 1;
  if (data?.[0]?.project_code) {
    const match = String(data[0].project_code).match(/-(\d+)$/);
    if (match) seq = Number(match[1]) + 1;
  }
  return `${prefix}${String(seq).padStart(3, "0")}`;
}

export function validateProjectPayload(body: {
  name?: string;
  customerId?: string;
  eventDate?: string;
}) {
  if (!body.name?.trim()) throw new Error("Nama event wajib diisi.");
  if (!body.customerId?.trim()) throw new Error("Customer wajib dipilih.");
  if (!body.eventDate?.trim()) throw new Error("Tanggal event wajib diisi.");
  const ev = new Date(`${body.eventDate.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(ev.getTime())) throw new Error("Tanggal event tidak valid.");
}

/** Validasi & normalisasi kode proyek untuk tag transaksi (opsional). */
export async function resolveProjectCodeForSave(
  supabase: SupabaseClient,
  orgId: string,
  explicitCode?: string | null,
  fallbackCode?: string | null
): Promise<string | null> {
  const code = normalizeProjectCode(explicitCode || fallbackCode || "");
  if (!code) return null;

  const { data, error } = await supabase
    .from("projects")
    .select("id")
    .eq("organization_id", orgId)
    .eq("project_code", code)
    .eq("active", true)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error(`Proyek tidak ditemukan: ${code}`);
  return code;
}
