"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Label, Select } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import type { ProjectDto, ProjectLrRow, ProjectTaskDto } from "@/lib/proyek/types";

type Tab = "daftar" | "buat" | "checklist" | "lr";
type Customer = { id: string; name: string };
type Meta = { statuses: string[]; taskTemplates: Array<{ key: string; label: string }> };

function formatRp(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(n);
}

function statusBadge(status: string) {
  if (status === "SELESAI") return "bg-emerald-100 text-emerald-700";
  if (status === "BATAL") return "bg-red-100 text-red-700";
  if (status === "BERJALAN") return "bg-blue-100 text-blue-700";
  if (status === "CONFIRMED") return "bg-violet-100 text-violet-700";
  return "bg-slate-100 text-slate-700";
}

function defaultDateRange() {
  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth(), 1);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

const emptyForm = () => ({
  projectCode: "",
  name: "",
  customerId: "",
  eventDate: new Date().toISOString().slice(0, 10),
  location: "",
  pax: "0",
  status: "DRAFT",
  pic: "",
  notes: "",
  quotationNo: ""
});

export default function ProyekPageClient() {
  const [tab, setTab] = useState<Tab>("daftar");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [listStatus, setListStatus] = useState("");
  const [listSearch, setListSearch] = useState("");
  const [upcomingOnly, setUpcomingOnly] = useState(false);

  const [form, setForm] = useState(emptyForm);

  const [checkProjectCode, setCheckProjectCode] = useState("");
  const [tasks, setTasks] = useState<ProjectTaskDto[]>([]);
  const [taskProgress, setTaskProgress] = useState({ total: 0, done: 0, overdue: 0, progressPct: 0 });
  const [templateKey, setTemplateKey] = useState("wedding");
  const [tasksLoading, setTasksLoading] = useState(false);

  const defaults = useMemo(() => defaultDateRange(), []);
  const [lrStart, setLrStart] = useState(defaults.start);
  const [lrEnd, setLrEnd] = useState(defaults.end);
  const [lrRows, setLrRows] = useState<ProjectLrRow[]>([]);
  const [lrTotals, setLrTotals] = useState({ pendapatan: 0, beban: 0, margin: 0, marginPct: 0 });
  const [lrLoading, setLrLoading] = useState(false);
  const [lrDetailCode, setLrDetailCode] = useState<string | null>(null);
  const [lrDetail, setLrDetail] = useState<{
    pemasukan: Array<{ tanggal: string; docNo: string; party: string; total: number }>;
    pembelian: Array<{ tanggal: string; docNo: string; party: string; total: number }>;
    totals: { pendapatan: number; beban: number; margin: number };
  } | null>(null);

  const loadBootstrap = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [metaRes, bootRes] = await Promise.all([
        fetch("/api/projects/meta"),
        fetch("/api/invoices/bootstrap")
      ]);
      const metaData = await metaRes.json();
      const bootData = await bootRes.json();
      if (!metaRes.ok) throw new Error(metaData.error);
      if (!bootRes.ok) throw new Error(bootData.error);
      setMeta(metaData);
      setCustomers(bootData.customers || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadProjects = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (listStatus) params.set("status", listStatus);
      if (listSearch) params.set("search", listSearch);
      if (upcomingOnly) params.set("upcoming", "1");
      const res = await fetch(`/api/projects?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setProjects(data.rows || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat proyek");
      setProjects([]);
    }
  }, [listStatus, listSearch, upcomingOnly]);

  const loadTasks = useCallback(async (code: string) => {
    if (!code) return;
    setTasksLoading(true);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(code)}/tasks`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTasks(data.tasks || []);
      setTaskProgress(data.progress || { total: 0, done: 0, overdue: 0, progressPct: 0 });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat checklist");
      setTasks([]);
    } finally {
      setTasksLoading(false);
    }
  }, []);

  const loadLr = useCallback(async () => {
    setLrLoading(true);
    try {
      const params = new URLSearchParams({ start: lrStart, end: lrEnd });
      const res = await fetch(`/api/projects/lr?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLrRows(data.rows || []);
      setLrTotals(data.totals || { pendapatan: 0, beban: 0, margin: 0, marginPct: 0 });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat L/R");
      setLrRows([]);
    } finally {
      setLrLoading(false);
    }
  }, [lrStart, lrEnd]);

  useEffect(() => {
    void loadBootstrap();
  }, [loadBootstrap]);

  useEffect(() => {
    if (tab === "daftar" || tab === "checklist") void loadProjects();
  }, [tab, loadProjects]);

  useEffect(() => {
    if (tab === "checklist" && checkProjectCode) void loadTasks(checkProjectCode);
  }, [tab, checkProjectCode, loadTasks]);

  useEffect(() => {
    if (tab === "lr") void loadLr();
  }, [tab, loadLr]);

  function editProject(p: ProjectDto) {
    setForm({
      projectCode: p.projectCode,
      name: p.name,
      customerId: p.customerId || "",
      eventDate: p.eventDate,
      location: p.location,
      pax: String(p.pax),
      status: p.status,
      pic: p.pic,
      notes: p.notes,
      quotationNo: p.quotationNo
    });
    setTab("buat");
    setMessage(null);
  }

  async function saveProject() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_code: form.projectCode || undefined,
          name: form.name,
          customer_id: form.customerId,
          event_date: form.eventDate,
          location: form.location,
          pax: Number(form.pax) || 0,
          status: form.status,
          pic: form.pic,
          notes: form.notes,
          quotation_no: form.quotationNo
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage(form.projectCode ? "Proyek diperbarui" : `Proyek dibuat: ${data.project?.projectCode}`);
      if (!form.projectCode && data.project?.projectCode) {
        setForm((f) => ({ ...f, projectCode: data.project.projectCode }));
      }
      void loadProjects();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal simpan");
    } finally {
      setSaving(false);
    }
  }

  async function setProjectStatus(code: string, status: string) {
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(code)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      void loadProjects();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal ubah status");
    }
  }

  async function initTasks() {
    if (!checkProjectCode) return;
    setTasksLoading(true);
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(checkProjectCode)}/tasks/init`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ template_key: templateKey })
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage(`Checklist dibuat (${data.created} item)`);
      void loadTasks(checkProjectCode);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal buat checklist");
    } finally {
      setTasksLoading(false);
    }
  }

  async function updateTask(task: ProjectTaskDto, status: string) {
    try {
      const res = await fetch(`/api/projects/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      void loadTasks(checkProjectCode);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal update task");
    }
  }

  async function openLrDetail(code: string) {
    setLrDetailCode(code);
    try {
      const params = new URLSearchParams({ start: lrStart, end: lrEnd });
      const res = await fetch(
        `/api/projects/${encodeURIComponent(code)}/lr-detail?${params}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLrDetail(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat detail L/R");
      setLrDetail(null);
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "daftar", label: "Daftar Proyek" },
    { id: "buat", label: form.projectCode ? "Edit Proyek" : "Buat Proyek" },
    { id: "checklist", label: "Checklist" },
    { id: "lr", label: "L/R Proyek" }
  ];

  if (loading) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-8">
        <p className="text-sm text-slate-500">Memuat modul proyek…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <PageHeader
        badge="Add-on · Manajemen Proyek"
        title="Proyek"
        description="Event & proyek catering — daftar, checklist, dan laporan L/R."
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Button
            key={t.id}
            type="button"
            variant={tab === t.id ? "primary" : "secondary"}
            onClick={() => {
              setTab(t.id);
              setError(null);
              setMessage(null);
            }}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {error && (
        <Card className="mb-4 border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</Card>
      )}
      {message && (
        <Card className="mb-4 border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          {message}
        </Card>
      )}

      {tab === "daftar" && (
        <Card className="p-6">
          <div className="mb-4 grid gap-3 sm:grid-cols-4">
            <div>
              <Label>Status</Label>
              <Select value={listStatus} onChange={(e) => setListStatus(e.target.value)}>
                <option value="">Semua</option>
                {(meta?.statuses || []).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>Cari</Label>
              <Input
                value={listSearch}
                onChange={(e) => setListSearch(e.target.value)}
                placeholder="Kode, nama, customer, lokasi…"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={upcomingOnly}
                  onChange={(e) => setUpcomingOnly(e.target.checked)}
                />
                Hanya upcoming
              </label>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="py-2 pr-3">Kode</th>
                  <th className="py-2 pr-3">Event</th>
                  <th className="py-2 pr-3">Customer</th>
                  <th className="py-2 pr-3">Tanggal</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id} className="border-b border-slate-100">
                    <td className="py-2 pr-3 font-mono text-xs">{p.projectCode}</td>
                    <td className="py-2 pr-3">{p.name}</td>
                    <td className="py-2 pr-3">{p.customerName}</td>
                    <td className="py-2 pr-3">{p.eventDate}</td>
                    <td className="py-2 pr-3">
                      <span className={`rounded px-2 py-0.5 text-xs ${statusBadge(p.status)}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-1">
                        <Button type="button" variant="secondary" className="py-1 text-xs" onClick={() => editProject(p)}>
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          className="py-1 text-xs"
                          onClick={() => {
                            setCheckProjectCode(p.projectCode);
                            setTab("checklist");
                          }}
                        >
                          Checklist
                        </Button>
                        {p.status !== "SELESAI" && (
                          <Button
                            type="button"
                            variant="secondary"
                            className="py-1 text-xs"
                            onClick={() => void setProjectStatus(p.projectCode, "SELESAI")}
                          >
                            Selesai
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {projects.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-400">
                      Belum ada proyek
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === "buat" && (
        <Card className="p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            {form.projectCode && (
              <div>
                <Label>Kode</Label>
                <Input value={form.projectCode} readOnly className="bg-slate-50 font-mono" />
              </div>
            )}
            <div className={form.projectCode ? "" : "sm:col-span-2"}>
              <Label>Nama event *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Customer *</Label>
              <Select
                value={form.customerId}
                onChange={(e) => setForm({ ...form, customerId: e.target.value })}
              >
                <option value="">— pilih —</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Tanggal event *</Label>
              <Input
                type="date"
                value={form.eventDate}
                onChange={(e) => setForm({ ...form, eventDate: e.target.value })}
              />
            </div>
            <div>
              <Label>Lokasi</Label>
              <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </div>
            <div>
              <Label>Pax</Label>
              <Input
                type="number"
                value={form.pax}
                onChange={(e) => setForm({ ...form, pax: e.target.value })}
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {(meta?.statuses || []).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>PIC</Label>
              <Input value={form.pic} onChange={(e) => setForm({ ...form, pic: e.target.value })} />
            </div>
            <div>
              <Label>Quotation No</Label>
              <Input
                value={form.quotationNo}
                onChange={(e) => setForm({ ...form, quotationNo: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Catatan</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <div className="mt-6 flex gap-2">
            <Button type="button" disabled={saving} onClick={() => void saveProject()}>
              {saving ? "Menyimpan…" : form.projectCode ? "Simpan perubahan" : "Buat proyek"}
            </Button>
            {form.projectCode && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setForm(emptyForm());
                  setMessage(null);
                }}
              >
                Proyek baru
              </Button>
            )}
          </div>
        </Card>
      )}

      {tab === "checklist" && (
        <Card className="p-6">
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Label>Proyek</Label>
              <Select value={checkProjectCode} onChange={(e) => setCheckProjectCode(e.target.value)}>
                <option value="">— pilih proyek —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.projectCode}>
                    {p.projectCode} — {p.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Template (jika belum ada checklist)</Label>
              <div className="flex gap-2">
                <Select value={templateKey} onChange={(e) => setTemplateKey(e.target.value)}>
                  {(meta?.taskTemplates || []).map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
                </Select>
                <Button type="button" variant="secondary" disabled={!checkProjectCode || tasksLoading} onClick={() => void initTasks()}>
                  Init
                </Button>
              </div>
            </div>
          </div>

          {checkProjectCode && (
            <p className="mb-4 text-sm text-slate-600">
              Progress: {taskProgress.done}/{taskProgress.total} ({taskProgress.progressPct}%)
              {taskProgress.overdue > 0 && (
                <span className="ml-2 text-red-600">· {taskProgress.overdue} overdue</span>
              )}
            </p>
          )}

          {tasksLoading ? (
            <p className="text-sm text-slate-500">Memuat checklist…</p>
          ) : (
            <div className="space-y-2">
              {tasks.map((t) => (
                <div
                  key={t.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium">{t.title}</p>
                    <p className="text-xs text-slate-500">
                      {t.phase} · {t.offsetLabel} · deadline {t.deadline || "—"}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    {(["PENDING", "DONE", "NA"] as const).map((s) => (
                      <Button
                        key={s}
                        type="button"
                        variant={t.status === s ? "primary" : "secondary"}
                        className="py-0.5 text-[10px]"
                        onClick={() => void updateTask(t, s)}
                      >
                        {s}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
              {checkProjectCode && tasks.length === 0 && (
                <p className="text-sm text-slate-400">Belum ada checklist — pilih template lalu Init.</p>
              )}
            </div>
          )}
        </Card>
      )}

      {tab === "lr" && (
        <Card className="p-6">
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <div>
              <Label>Dari</Label>
              <Input type="date" value={lrStart} onChange={(e) => setLrStart(e.target.value)} />
            </div>
            <div>
              <Label>Sampai</Label>
              <Input type="date" value={lrEnd} onChange={(e) => setLrEnd(e.target.value)} />
            </div>
            <div className="flex items-end">
              <Button type="button" variant="secondary" onClick={() => void loadLr()}>
                Refresh
              </Button>
            </div>
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-emerald-50 p-3">
              <p className="text-xs text-emerald-700">Pendapatan</p>
              <p className="text-lg font-semibold text-emerald-800">{formatRp(lrTotals.pendapatan)}</p>
            </div>
            <div className="rounded-lg bg-red-50 p-3">
              <p className="text-xs text-red-700">Beban</p>
              <p className="text-lg font-semibold text-red-800">{formatRp(lrTotals.beban)}</p>
            </div>
            <div className="rounded-lg bg-blue-50 p-3">
              <p className="text-xs text-blue-700">Margin</p>
              <p className="text-lg font-semibold text-blue-800">
                {formatRp(lrTotals.margin)} ({lrTotals.marginPct}%)
              </p>
            </div>
          </div>

          {lrLoading ? (
            <p className="text-sm text-slate-500">Memuat L/R…</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-slate-500">
                    <th className="py-2 pr-3">Kode</th>
                    <th className="py-2 pr-3">Event</th>
                    <th className="py-2 pr-3">Pendapatan</th>
                    <th className="py-2 pr-3">Beban</th>
                    <th className="py-2 pr-3">Margin</th>
                    <th className="py-2">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {lrRows.map((r) => (
                    <tr key={r.projectCode} className="border-b border-slate-100">
                      <td className="py-2 pr-3 font-mono text-xs">{r.projectCode}</td>
                      <td className="py-2 pr-3">{r.name}</td>
                      <td className="py-2 pr-3">{formatRp(r.pendapatan)}</td>
                      <td className="py-2 pr-3">{formatRp(r.beban)}</td>
                      <td className="py-2 pr-3">
                        {formatRp(r.margin)} ({r.marginPct}%)
                      </td>
                      <td className="py-2">
                        <Button
                          type="button"
                          variant="secondary"
                          className="py-1 text-xs"
                          onClick={() => void openLrDetail(r.projectCode)}
                        >
                          Lihat
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {lrRows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-slate-400">
                        Tidak ada data L/R pada periode ini
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {lrDetailCode && lrDetail && (
            <div className="mt-6 rounded-lg border border-slate-200 p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="font-medium">Detail L/R — {lrDetailCode}</p>
                <Button type="button" variant="secondary" className="py-1 text-xs" onClick={() => setLrDetailCode(null)}>
                  Tutup
                </Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-2 text-sm font-medium text-emerald-700">Pemasukan (Invoice)</p>
                  <ul className="space-y-1 text-xs text-slate-600">
                    {lrDetail.pemasukan.map((r, i) => (
                      <li key={i}>
                        {r.tanggal} · {r.docNo} · {r.party} · {formatRp(r.total)}
                      </li>
                    ))}
                    {lrDetail.pemasukan.length === 0 && <li>—</li>}
                  </ul>
                </div>
                <div>
                  <p className="mb-2 text-sm font-medium text-red-700">Pembelian (PO)</p>
                  <ul className="space-y-1 text-xs text-slate-600">
                    {lrDetail.pembelian.map((r, i) => (
                      <li key={i}>
                        {r.tanggal} · {r.docNo} · {r.party} · {formatRp(r.total)}
                      </li>
                    ))}
                    {lrDetail.pembelian.length === 0 && <li>—</li>}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </Card>
      )}
    </main>
  );
}
