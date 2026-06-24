import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-white to-blue-50 p-6">
      <div className="max-w-lg text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-brand-600">Premium · Hybrid Lab</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Akuntansi App</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-500">
          UI Next.js + Supabase. Jurnal akuntansi langsung di database (Tahap D — tanpa sheet bridge).
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/login"
            className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-600/25 transition hover:bg-brand-700"
          >
            Login
          </Link>
          <Link
            href="/dashboard"
            className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
