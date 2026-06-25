export const PROJECT_STATUSES = ["DRAFT", "CONFIRMED", "BERJALAN", "SELESAI", "BATAL"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const TASK_STATUSES = ["PENDING", "DONE", "NA"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export type ProjectRow = {
  id: string;
  organization_id: string;
  project_code: string;
  name: string;
  customer_id: string | null;
  event_date: string;
  location: string | null;
  pax: number;
  status: string;
  pic: string | null;
  notes: string | null;
  quotation_no: string | null;
  active: boolean;
  customers?: { name: string } | { name: string }[] | null;
};

export type ProjectDto = {
  id: string;
  projectCode: string;
  name: string;
  customerId: string | null;
  customerName: string;
  eventDate: string;
  location: string;
  pax: number;
  status: ProjectStatus;
  pic: string;
  notes: string;
  quotationNo: string;
  active: boolean;
};

export type ProjectTaskDto = {
  id: string;
  projectId: string;
  templateKey: string;
  phase: string;
  title: string;
  offsetDays: number;
  offsetLabel: string;
  deadline: string;
  pic: string;
  status: TaskStatus;
  notes: string;
  sortOrder: number;
  completedAt: string;
};

export type ProjectLrRow = {
  projectCode: string;
  name: string;
  customerName: string;
  eventDate: string;
  status: string;
  location: string;
  pic: string;
  pendapatan: number;
  beban: number;
  margin: number;
  marginPct: number;
};
