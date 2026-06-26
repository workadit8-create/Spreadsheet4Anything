"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";

export function InventoryPlaceholderPage({
  badge,
  title,
  description
}: {
  badge: string;
  title: string;
  description: string;
}) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <PageHeader badge={badge} title={title} description={description} />
      <Card className="p-6 text-sm text-slate-600">
        <p className="font-medium text-slate-900">Segera hadir</p>
        <p className="mt-2">
          Modul ini akan dilengkapi pada fase berikutnya. Add-on sudah terdaftar — Tirta dan org tanpa
          add-on tidak terpengaruh.
        </p>
        <Link href="/dashboard" className="mt-4 inline-block text-sm font-medium text-brand-600 hover:text-brand-700">
          ← Dashboard
        </Link>
      </Card>
    </main>
  );
}
