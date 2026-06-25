import { NextResponse } from "next/server";
import { wibMonthStartIso, wibTodayIso } from "@/lib/date/wib";
import { createClient } from "@/lib/supabase/server";
import { requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import {
  buildHppExportRows,
  buildKategoriExportRows,
  buildProdukExportRows,
  EXPORT_HEADERS,
  rowsToCsv
} from "@/lib/penjualan/export-csv";
import { fetchPenjualanHistory, flattenLinesForExport } from "@/lib/penjualan/fetch-history-data";

const TYPES = new Set(["produk", "kategori", "hpp"]);

function parseDateRange(url: string) {
  const { searchParams } = new URL(url);
  const defaultStart = wibMonthStartIso();
  const defaultEnd = wibTodayIso();

  return {
    start: searchParams.get("start") || defaultStart,
    end: searchParams.get("end") || defaultEnd,
    customerId: searchParams.get("customer_id") || undefined,
    type: searchParams.get("type") || "produk"
  };
}

export async function GET(request: Request) {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch (e) {
    return toOrgAuthResponse(e);
  }
  const { user, org } = auth;

  const { start, end, customerId, type } = parseDateRange(request.url);
  if (!TYPES.has(type)) {
    return NextResponse.json({ error: "Tipe export tidak valid" }, { status: 400 });
  }

  try {
    const bundle = await fetchPenjualanHistory(supabase, org.id, { start, end, customerId });
    const flatLines = flattenLinesForExport(bundle);

    let rows: Record<string, string | number>[] = [];
    let headers: readonly string[] = EXPORT_HEADERS.produk;
    let label = "Produk";

    if (type === "produk") {
      rows = buildProdukExportRows(flatLines);
      headers = EXPORT_HEADERS.produk;
      label = "Rincian_Produk";
    } else if (type === "kategori") {
      rows = buildKategoriExportRows(flatLines);
      headers = EXPORT_HEADERS.kategori;
      label = "Per_Kategori";
    } else {
      rows = buildHppExportRows(flatLines);
      headers = EXPORT_HEADERS.hpp;
      label = "Per_HPP";
    }

    const csv = rowsToCsv([...headers], rows);
    const filename = `Penjualan_${label}_${start}_sampai_${end}.csv`;

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`
      }
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal export" },
      { status: 500 }
    );
  }
}
