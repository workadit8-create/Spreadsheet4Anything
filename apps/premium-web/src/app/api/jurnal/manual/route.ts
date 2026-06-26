import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePostingRole, requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import { AUDIT_ACTIONS, auditFromContext, writeAuditLog } from "@/lib/audit/log";
import { fetchOutletBootstrap } from "@/lib/outlets/bootstrap-options";
import { fetchOrgAddons, isAddonEnabled } from "@/lib/org/addons";
import { ensureDefaultCoa } from "@/lib/coa/seed-default-coa";
import {
  buildManualJournalLines,
  validateManualJournalLines,
  type ManualJournalLineInput
} from "@/lib/posting/manual-journal";
import { postJournalEntry } from "@/lib/posting/journal-supabase";
import { generateManualDocNo, generateManualTransactionId } from "@/lib/posting/ids";

export async function GET() {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch (e) {
    return toOrgAuthResponse(e);
  }
  const { user, org } = auth;

  await ensureDefaultCoa(supabase, org.id);

  const [coa, entries, outletBootstrap] = await Promise.all([
    supabase
      .from("coa_accounts")
      .select("id, code, name, account_type")
      .eq("organization_id", org.id)
      .eq("active", true)
      .order("code"),
    supabase
      .from("journal_entries")
      .select(
        "id, doc_no, entry_date, transaction_id, created_at, metadata, journal_lines(account_name, debit, credit, keterangan, sort_order, outlet_code)"
      )
      .eq("organization_id", org.id)
      .eq("modul", "MANUAL")
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(30),
    fetchOutletBootstrap(supabase, org.id)
  ]);

  const coaErr = coa.error;
  const entErr = entries.error;

  if (coaErr) return NextResponse.json({ error: coaErr.message }, { status: 500 });
  if (entErr) return NextResponse.json({ error: entErr.message }, { status: 500 });

  return NextResponse.json({
    coa: coa.data || [],
    entries: entries.data || [],
    outletAddon: outletBootstrap
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch (e) {
    return toOrgAuthResponse(e);
  }
  requirePostingRole(auth.role);
  const { user, org } = auth;

  const body = await request.json();
  const entryDate = String(body.entryDate || "").slice(0, 10);
  const keterangan = String(body.keterangan || "Jurnal manual").trim();
  const docNo = String(body.docNo || "").trim() || generateManualDocNo();
  const lines = (body.lines || []) as ManualJournalLineInput[];

  if (!entryDate) {
    return NextResponse.json({ error: "Tanggal jurnal wajib" }, { status: 400 });
  }

  const validation = validateManualJournalLines(lines);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const addons = await fetchOrgAddons(supabase, org.id);
  const outletOn = isAddonEnabled(addons, "outlet");
  const journalInputLines = outletOn
    ? lines
    : lines.map((line) => ({ ...line, outletCode: null }));

  try {
    await ensureDefaultCoa(supabase, org.id);

    const journalLines = buildManualJournalLines(entryDate, journalInputLines, keterangan);
    const transactionId = generateManualTransactionId();

    const result = await postJournalEntry(
      supabase,
      {
        organizationId: org.id,
        modul: "MANUAL",
        transactionId,
        docNo,
        entryDate,
        sourceDocType: "MANUAL",
        metadata: {
          keterangan,
          kind: body.kind || "manual",
          created_by: user.id
        }
      },
      journalLines
    );

    await writeAuditLog(
      supabase,
      auditFromContext(auth, AUDIT_ACTIONS.journalManual, {
        resourceType: "journal_entry",
        resourceId: result.entryId,
        metadata: { docNo, transactionId, entryDate, lineCount: result.lineCount },
        request
      })
    );

    return NextResponse.json({
      ok: true,
      entryId: result.entryId,
      docNo,
      transactionId,
      skipped: result.skipped,
      lineCount: result.lineCount
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Gagal posting jurnal manual";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
