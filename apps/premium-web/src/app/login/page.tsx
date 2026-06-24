"use client";

import { useState } from "react";
import { loginAction } from "./actions";

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
      if (result?.error) {
        setMessage(result.error);
      }
    } catch (err) {
      if (err instanceof Error && err.message === "NEXT_REDIRECT") {
        return;
      }
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
          name="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ width: "100%", padding: 10, marginBottom: 14, borderRadius: 8, border: "1px solid #e2e8f0", boxSizing: "border-box" }}
        />
        <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Password</label>
        <input
          type="password"
          name="password"
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
        <p style={{ marginTop: 16, fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>
          Lab: Supabase → Users → <strong>Create user</strong> (email + password), centang{" "}
          <strong>Auto Confirm User</strong>. Jangan pakai Invite saja.
        </p>
      </form>
    </main>
  );
}
