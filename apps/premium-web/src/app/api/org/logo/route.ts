import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserPrimaryOrg } from "@/lib/org/get-user-org";
import {
  LOGO_ALLOWED_MIME,
  LOGO_MAX_BYTES,
  ORG_LOGO_BUCKET,
  orgLogoPublicUrl,
  orgLogoStoragePath
} from "@/lib/org/logo";

async function readBusinessSettings(supabase: Awaited<ReturnType<typeof createClient>>, orgId: string) {
  const { data } = await supabase
    .from("app_settings")
    .select("settings")
    .eq("organization_id", orgId)
    .maybeSingle();

  return (data?.settings as Record<string, unknown>) || {};
}

async function saveLogoPath(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  logoPath: string | null
) {
  const existing = await readBusinessSettings(supabase, orgId);
  const business = (existing.business as Record<string, unknown> | undefined) || {};

  const mergedSettings = {
    ...existing,
    business: {
      ...business,
      logo_path: logoPath
    }
  };

  const { error } = await supabase.from("app_settings").upsert({
    organization_id: orgId,
    settings: mergedSettings,
    updated_at: new Date().toISOString()
  });

  return error;
}

async function removeExistingLogos(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string
) {
  const { data: files } = await supabase.storage.from(ORG_LOGO_BUCKET).list(orgId);

  const paths = (files || [])
    .filter((f) => f.name?.startsWith("logo."))
    .map((f) => `${orgId}/${f.name}`);

  if (paths.length) {
    await supabase.storage.from(ORG_LOGO_BUCKET).remove(paths);
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const org = await getUserPrimaryOrg(supabase);
  if (!org) return NextResponse.json({ error: "Tidak ada organisasi" }, { status: 400 });

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File logo wajib diunggah" }, { status: 400 });
  }

  if (!LOGO_ALLOWED_MIME.includes(file.type)) {
    return NextResponse.json({ error: "Format harus PNG, JPG, atau WEBP" }, { status: 400 });
  }

  if (file.size > LOGO_MAX_BYTES) {
    return NextResponse.json({ error: "Ukuran logo maksimal 2 MB" }, { status: 400 });
  }

  const storagePath = orgLogoStoragePath(org.id, file.type);
  if (!storagePath) {
    return NextResponse.json({ error: "Format file tidak didukung" }, { status: 400 });
  }

  await removeExistingLogos(supabase, org.id);

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from(ORG_LOGO_BUCKET)
    .upload(storagePath, buffer, {
      upsert: true,
      contentType: file.type,
      cacheControl: "3600"
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const settingsError = await saveLogoPath(supabase, org.id, storagePath);
  if (settingsError) {
    return NextResponse.json({ error: settingsError.message }, { status: 500 });
  }

  return NextResponse.json({
    logoPath: storagePath,
    logoUrl: `${orgLogoPublicUrl(storagePath)}?v=${Date.now()}`
  });
}

export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const org = await getUserPrimaryOrg(supabase);
  if (!org) return NextResponse.json({ error: "Tidak ada organisasi" }, { status: 400 });

  await removeExistingLogos(supabase, org.id);

  const settingsError = await saveLogoPath(supabase, org.id, null);
  if (settingsError) {
    return NextResponse.json({ error: settingsError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
