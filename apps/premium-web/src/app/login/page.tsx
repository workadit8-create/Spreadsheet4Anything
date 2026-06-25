"use client";

import { useState } from "react";
import { loginAction } from "./actions";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";

export default function LoginPage() {
  const [email, setEmail] = useState("workadit8@gmail.com");
  const [password, setPassword] = useState("");
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
            <Input
              type="password"
              name="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </div>

        {message && <p className="mt-4 text-sm text-red-600">{message}</p>}

        <Button type="submit" disabled={loading} className="mt-6 w-full py-2.5">
          {loading ? "Memuat..." : "Masuk"}
        </Button>

        <p className="mt-5 text-xs leading-relaxed text-slate-500">
          Lab: Supabase → Users → <strong>Create user</strong>, centang <strong>Auto Confirm</strong>.
        </p>
      </form>
    </main>
  );
}
