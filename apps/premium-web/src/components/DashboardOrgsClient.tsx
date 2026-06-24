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
    return <p style={{ color: "#64748b", fontSize: 14 }}>Memuat organisasi...</p>;
  }

  if (error) {
    return (
      <p style={{ color: "#dc2626", fontSize: 14, lineHeight: 1.6 }}>
        Error baca organisasi: {error}
      </p>
    );
  }

  if (!orgs.length) {
    return (
      <p style={{ color: "#64748b", fontSize: 14, lineHeight: 1.6 }}>
        Belum ada organisasi untuk session ini. Coba logout → login ulang.
        <br />
        Jika masih 0, jalankan: <code>./scripts/run-supabase-post-setup.sh</code>
      </p>
    );
  }

  return (
    <ul style={{ margin: 0, paddingLeft: 18 }}>
      {orgs.map((o) => (
        <li key={o.id} style={{ marginBottom: 6 }}>
          <strong>{o.name}</strong> <code style={{ fontSize: 12 }}>{o.slug}</code>
        </li>
      ))}
    </ul>
  );
}
