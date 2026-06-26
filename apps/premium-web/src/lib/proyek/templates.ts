export type TaskTemplateItem = {
  phase: string;
  title: string;
  offsetDays: number;
  required?: boolean;
};

export type TaskTemplate = {
  key: string;
  label: string;
  items: TaskTemplateItem[];
};

export const PROJECT_TASK_TEMPLATES: Record<string, TaskTemplate> = {
  wedding: {
    key: "wedding",
    label: "Wedding / Perayaan Besar",
    items: [
      { phase: "Pre-deal", title: "Data proyek lengkap (customer, tanggal, pax, lokasi)", offsetDays: -21 },
      { phase: "Pre-deal", title: "Quotation terkirim ke customer", offsetDays: -21 },
      { phase: "Pre-deal", title: "Follow-up & negosiasi menu", offsetDays: -14 },
      { phase: "Pre-deal", title: "DP masuk — update status CONFIRMED", offsetDays: -14 },
      { phase: "Pre-deal", title: "Lock menu & pax final", offsetDays: -14 },
      { phase: "Persiapan", title: "PRE bahan", offsetDays: -7 },
      { phase: "Persiapan", title: "Expense bahan — tag ke proyek", offsetDays: -5 },
      { phase: "Persiapan", title: "Cek stok / belanja sisa", offsetDays: -3 },
      { phase: "Persiapan", title: "Briefing crew + transport + peralatan", offsetDays: -1 },
      { phase: "Persiapan", title: "Konfirmasi ulang ke customer", offsetDays: -1 },
      { phase: "H-day", title: "Setup di lokasi", offsetDays: 0 },
      { phase: "H-day", title: "Serving / operasional", offsetDays: 0 },
      { phase: "H-day", title: "Breakdown & bersih-bersih", offsetDays: 0 },
      { phase: "Post-event", title: "Invoice final — tag proyek", offsetDays: 1 },
      { phase: "Post-event", title: "Review L/R proyek", offsetDays: 2 },
      { phase: "Post-event", title: "Tandai proyek SELESAI", offsetDays: 2 },
      { phase: "Post-event", title: "Feedback customer", offsetDays: 3, required: false }
    ]
  },
  corporate: {
    key: "corporate",
    label: "Corporate / Gathering",
    items: [
      { phase: "Pre-deal", title: "Data proyek & quotation", offsetDays: -10 },
      { phase: "Pre-deal", title: "Deal / konfirmasi order", offsetDays: -7 },
      { phase: "Persiapan", title: "PRE bahan", offsetDays: -5 },
      { phase: "Persiapan", title: "Expense bahan — tag proyek", offsetDays: -3 },
      { phase: "Persiapan", title: "Briefing internal crew", offsetDays: -1 },
      { phase: "H-day", title: "Setup — serve — breakdown", offsetDays: 0 },
      { phase: "Post-event", title: "Invoice final — tag proyek", offsetDays: 1 },
      { phase: "Post-event", title: "Review L/R + tandai SELESAI", offsetDays: 2 }
    ]
  },
  kecil: {
    key: "kecil",
    label: "Event Kecil / Aqiqah / Family",
    items: [
      { phase: "Pre-deal", title: "Proyek + quotation", offsetDays: -7 },
      { phase: "Pre-deal", title: "Deal / konfirmasi", offsetDays: -5 },
      { phase: "Persiapan", title: "PRE bahan", offsetDays: -5 },
      { phase: "Persiapan", title: "Expense bahan — tag proyek", offsetDays: -3 },
      { phase: "H-day", title: "Operasional event", offsetDays: 0 },
      { phase: "Post-event", title: "Invoice — tag proyek", offsetDays: 1 },
      { phase: "Post-event", title: "Review L/R + SELESAI", offsetDays: 2 }
    ]
  }
};

export function listTaskTemplateOptions() {
  return Object.values(PROJECT_TASK_TEMPLATES).map((t) => ({
    key: t.key,
    label: t.label,
    itemCount: t.items.length
  }));
}
