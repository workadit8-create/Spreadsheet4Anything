import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";

const MIN_PASSWORD_LENGTH = 8;

export async function POST(request: Request) {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch (e) {
    return toOrgAuthResponse(e);
  }

  let body: { currentPassword?: string; newPassword?: string; confirmPassword?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON tidak valid" }, { status: 400 });
  }

  const currentPassword = String(body.currentPassword ?? "");
  const newPassword = String(body.newPassword ?? "");
  const confirmPassword = String(body.confirmPassword ?? "");
  const email = auth.user.email;

  if (!email) {
    return NextResponse.json({ error: "Akun tidak punya email" }, { status: 400 });
  }
  if (!currentPassword) {
    return NextResponse.json({ error: "Password saat ini wajib diisi" }, { status: 400 });
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Password baru minimal ${MIN_PASSWORD_LENGTH} karakter` },
      { status: 400 }
    );
  }
  if (newPassword !== confirmPassword) {
    return NextResponse.json({ error: "Konfirmasi password tidak cocok" }, { status: 400 });
  }
  if (newPassword === currentPassword) {
    return NextResponse.json({ error: "Password baru harus berbeda dari yang lama" }, { status: 400 });
  }

  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email,
    password: currentPassword
  });
  if (verifyError) {
    return NextResponse.json({ error: "Password saat ini salah" }, { status: 400 });
  }

  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: "Password berhasil diubah" });
}
