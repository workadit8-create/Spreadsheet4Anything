import Link from "next/link";

export default function HomePage() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ maxWidth: 480, textAlign: "center" }}>
        <p style={{ color: "#2563eb", fontWeight: 700, letterSpacing: 1, fontSize: 12 }}>
          PREMIUM · HYBRID LAB
        </p>
        <h1 style={{ margin: "8px 0 12px", fontSize: 28 }}>Akuntansi App</h1>
        <p style={{ color: "#64748b", lineHeight: 1.6, marginBottom: 24 }}>
          UI Next.js + Supabase. Engine akuntansi tetap BACKENDengine (GAS HYBRID LAB).
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link
            href="/login"
            style={{
              background: "#2563eb",
              color: "#fff",
              padding: "10px 20px",
              borderRadius: 8,
              textDecoration: "none",
              fontWeight: 600
            }}
          >
            Login
          </Link>
          <Link
            href="/dashboard"
            style={{
              background: "#fff",
              color: "#334155",
              padding: "10px 20px",
              borderRadius: 8,
              textDecoration: "none",
              border: "1px solid #e2e8f0"
            }}
          >
            Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
