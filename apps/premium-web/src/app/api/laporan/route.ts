import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserPrimaryOrg } from "@/lib/org/get-user-org";
import { ensureDefaultCoa } from "@/lib/coa/seed-default-coa";
import {
  buildArusKas,
  buildBukuBesar,
  buildLabaRugi,
  buildNeraca,
  fetchReportData
} from "@/lib/laporan";

const REPORT_TYPES = ["buku-besar", "laba-rugi", "neraca", "arus-kas"] as const;
type ReportType = (typeof REPORT_TYPES)[number];

function defaultPeriod() {
  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth(), 1);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10)
  };
}

function parsePeriod(url: URL) {
  const defaults = defaultPeriod();
  const start = url.searchParams.get("start") || defaults.start;
  const end = url.searchParams.get("end") || defaults.end;
  if (start > end) {
    return { error: "Tanggal mulai harus sebelum tanggal akhir" };
  }
  return { start, end };
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const org = await getUserPrimaryOrg(supabase);
  if (!org) return NextResponse.json({ error: "Tidak ada organisasi" }, { status: 400 });

  const url = new URL(request.url);
  const type = (url.searchParams.get("type") || "buku-besar") as ReportType;
  if (!REPORT_TYPES.includes(type)) {
    return NextResponse.json({ error: "Jenis laporan tidak valid" }, { status: 400 });
  }

  const periodResult = parsePeriod(url);
  if ("error" in periodResult) {
    return NextResponse.json({ error: periodResult.error }, { status: 400 });
  }

  const period = { start: periodResult.start, end: periodResult.end };
  const account = url.searchParams.get("account") || undefined;

  try {
    await ensureDefaultCoa(supabase, org.id);
    const data = await fetchReportData(supabase, org.id, period.end);

    if (type === "buku-besar") {
      const accounts = buildBukuBesar(data.coa, data.journalLines, period, account);
      return NextResponse.json({
        type,
        period,
        account: account || null,
        coaOptions: data.coa.map((c) => ({ code: c.code, name: c.name })),
        accounts
      });
    }

    if (type === "laba-rugi") {
      return NextResponse.json({
        type,
        period,
        report: buildLabaRugi(data.coa, data.journalLines, period)
      });
    }

    if (type === "neraca") {
      return NextResponse.json({
        type,
        period,
        report: buildNeraca(data.coa, data.journalLines, period)
      });
    }

    return NextResponse.json({
      type,
      period,
      report: buildArusKas(data.coa, data.journalLines, period, data.cashCoaNames)
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Gagal memuat laporan";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
