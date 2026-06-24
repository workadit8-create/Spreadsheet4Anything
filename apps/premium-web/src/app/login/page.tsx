"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Login gagal");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <form
        onSubmit={onSubmit}
        style={{
          width: "100%",
          maxWidth: 400,
          background: "#fff",
          padding: 24,
          borderRadius: 12,
          boxShadow: "0 4px 24px rgba(0,0,0,0.06)"
        }}
      >
        <h1 style={{ margin: "0 0 8px", fontSize: 22 }}>Login Premium</h1>
        <p style={{ margin: "0 0 20px", color: "#64748b", fontSize: 14 }}>
          HYBRID LAB · Supabase Auth
        </p>
        <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ width: "100%", padding: 10, marginBottom: 14, borderRadius: 8, border: "1px solid #e2e8f0", boxSizing: "border-box" }}
        />
        <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Password</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ width: "100%", padding: 10, marginBottom: 16, borderRadius: 8, border: "1px solid #e2e8f0", boxSizing: "border-box" }}
        />
        {message && (
          <p style={{ color: "#dc2626", fontSize: 13, marginBottom: 12 }}>{message}</p>
        )}
        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            padding: 12,
            background: "#2563eb",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontWeight: 600,
            cursor: loading ? "wait" : "pointer"
          }}
        >
          {loading ? "Memuat..." : "Masuk"}
        </button>
        <p style={{ marginTop: 16, fontSize: 12, color: "#94a3b8" }}>
          Buat user di Supabase → Authentication → Users (lab).
        </p>
      </form>
    </main>
  );
}
