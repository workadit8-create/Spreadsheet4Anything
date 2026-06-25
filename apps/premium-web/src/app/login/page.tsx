"use client";

import { useState } from "react";
import { loginAction } from "./actions";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"
        />
      </svg>
    );
  }
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.set("email", email);
      formData.set("password", password);
      const result = await loginAction(formData);
      if (result?.error) setMessage(result.error);
    } catch (err) {
      if (err instanceof Error && err.message === "NEXT_REDIRECT") return;
      setMessage(err instanceof Error ? err.message : "Login gagal");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md rounded-2xl border border-white/10 bg-white p-8 shadow-2xl shadow-slate-900/50"
      >
        <p className="text-xs font-bold uppercase tracking-widest text-brand-600">Premium</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">Masuk ke akun</h1>
        <p className="mt-1 text-sm text-slate-500">Akuntansi multi-usaha · Supabase Auth</p>

        <div className="mt-6 space-y-4">
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              name="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <Label>Password</Label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                name="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600"
                aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
              >
                <EyeIcon open={showPassword} />
              </button>
            </div>
          </div>
        </div>

        {message && <p className="mt-4 text-sm text-red-600">{message}</p>}

        <Button type="submit" disabled={loading} className="mt-6 w-full py-2.5">
          {loading ? "Memuat..." : "Masuk"}
        </Button>

        <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-semibold text-slate-700">Coba demo aplikasi</p>
          <p className="mt-1 text-xs text-slate-500">
            Tenant terpisah — data contoh, bukan data produksi.
          </p>
          <button
            type="button"
            className="mt-2 text-xs font-semibold text-brand-600 hover:text-brand-700"
            onClick={() => {
              setEmail("demo@premium-web.app");
              setPassword("PremiumDemo2026!");
              setMessage(null);
            }}
          >
            Isi akun demo →
          </button>
        </div>
      </form>
    </main>
  );
}
