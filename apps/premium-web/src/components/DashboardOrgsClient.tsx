"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type OrgRow = { id: string; slug: string; name: string };

export function DashboardOrgsClient() {
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createClient();

      const { data: rpcOrgs, error: rpcErr } = await supabase.rpc("get_my_organizations");
      if (!rpcErr && rpcOrgs?.length) {
        setOrgs(rpcOrgs as OrgRow[]);
        setLoading(false);
        return;
      }

      const { data: memberships, error: memErr } = await supabase
        .from("memberships")
        .select("organizations(id, slug, name)");

      if (memErr) {
        setError(rpcErr?.message || memErr.message);
        setLoading(false);
        return;
      }

      const list: OrgRow[] = [];
      (memberships || []).forEach((row: { organizations: OrgRow | OrgRow[] | null }) => {
        const raw = row.organizations;
        const o = Array.isArray(raw) ? raw[0] : raw;
        if (o?.id) list.push(o);
      });
      setOrgs(list);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return <p className="text-sm text-slate-500">Memuat organisasi...</p>;
  }

  if (error) {
    return (
      <p className="text-sm leading-relaxed text-red-600">
        Error baca organisasi: {error}
      </p>
    );
  }

  if (!orgs.length) {
    return (
      <p className="text-sm leading-relaxed text-slate-500">
        Belum ada organisasi untuk session ini. Coba logout → login ulang.
        <br />
        Jika masih 0, jalankan: <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">./scripts/run-supabase-post-setup.sh</code>
      </p>
    );
  }

  return (
    <ul className="mt-3 space-y-2 text-sm text-slate-700">
      {orgs.map((o) => (
        <li key={o.id}>
          <strong>{o.name}</strong>{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{o.slug}</code>
        </li>
      ))}
    </ul>
  );
}
