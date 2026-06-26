import { NextResponse } from "next/server";
import { wibMonthStartIso, wibTodayIso } from "@/lib/date/wib";
import { createClient } from "@/lib/supabase/server";
import { requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import {
  buildProdukExportRows,
  buildSupplierExportRows,
  EXPORT_HEADERS,
  rowsToCsv
} from "@/lib/pembelian/export-csv";
import { fetchPembelianHistory, flattenLinesForExport } from "@/lib/pembelian/fetch-history-data";

const TYPES = new Set(["produk", "supplier"]);

function parseDateRange(url: string) {
  const { searchParams } = new URL(url);
  const defaultStart = wibMonthStartIso();
  const defaultEnd = wibTodayIso();

  return {
    start: searchParams.get("start") || defaultStart,
    end: searchParams.get("end") || defaultEnd,
    supplierId: searchParams.get("supplier_id") || undefined,
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

  const { start, end, supplierId, type } = parseDateRange(request.url);
  if (!TYPES.has(type)) {
    return NextResponse.json({ error: "Tipe export tidak valid" }, { status: 400 });
  }

  try {
    const bundle = await fetchPembelianHistory(supabase, org.id, { start, end, supplierId });
    const flatLines = flattenLinesForExport(bundle);

    let rows: Record<string, string | number>[] = [];
    let headers: readonly string[] = EXPORT_HEADERS.produk;
    let label = "Rincian_Barang";

    if (type === "produk") {
      rows = buildProdukExportRows(flatLines);
      headers = EXPORT_HEADERS.produk;
      label = "Per_Barang";
    } else {
      rows = buildSupplierExportRows(flatLines);
      headers = EXPORT_HEADERS.supplier;
      label = "Per_Supplier";
    }

    const csv = rowsToCsv([...headers], rows);
    const filename = `Expense_${label}_${start}_sampai_${end}.csv`;

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
