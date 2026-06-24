import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserPrimaryOrg } from "@/lib/org/get-user-org";
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
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const defaultStart = firstDay.toISOString().slice(0, 10);
  const defaultEnd = today.toISOString().slice(0, 10);

  return {
    start: searchParams.get("start") || defaultStart,
    end: searchParams.get("end") || defaultEnd,
    customerId: searchParams.get("customer_id") || undefined,
    type: searchParams.get("type") || "produk"
  };
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const org = await getUserPrimaryOrg(supabase);
  if (!org) return NextResponse.json({ error: "Tidak ada organisasi" }, { status: 400 });

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
