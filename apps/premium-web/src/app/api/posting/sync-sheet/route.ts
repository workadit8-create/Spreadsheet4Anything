import { NextResponse } from "next/server";

/** Premium Tahap D: tidak ada sync ke sheet — endpoint deprecated. */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Sync sheet tidak dipakai di Premium (Supabase-only). Jurnal disimpan di tabel journal_entries."
    },
    { status: 400 }
  );
}
