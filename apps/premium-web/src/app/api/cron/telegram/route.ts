import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runTelegramCron } from "@/lib/telegram/cron-run";

function authorizeCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY required for Telegram cron" },
      { status: 503 }
    );
  }

  if (!process.env.TELEGRAM_BOT_TOKEN?.trim()) {
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN not configured" }, { status: 503 });
  }

  try {
    const admin = createAdminClient();
    const result = await runTelegramCron(admin, { ignoreHour: true });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
