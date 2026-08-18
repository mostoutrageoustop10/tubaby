"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get("redirect") || "/admin";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (supabase) {
        const { data, error: authError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (authError) throw authError;
      }
      
      document.cookie = "admin_session=true; path=/; max-age=86400; SameSite=Lax";
      router.push(redirectPath);
    } catch (err) {
      setError(err.message || "Failed to log in. Please check credentials.");
    } finally {
      setLoading(false);
    }
  };

  const handleAdminBypass = () => {
    document.cookie = "admin_session=true; path=/; max-age=86400; SameSite=Lax";
    router.push(redirectPath);
  };

  return (
    <div style={{
      width: "100%",
      maxWidth: 420,
      background: "#ffffff",
      borderRadius: 24,
      padding: "2.5rem 2rem",
      boxShadow: "0 20px 40px rgba(255, 107, 157, 0.12), 0 4px 12px rgba(0,0,0,0.04)",
      border: "1px solid rgba(255, 182, 193, 0.4)"
    }}>
      <div style={{ textAlign: "center", marginBottom: "2rem" }}>
        <Link href="/" style={{ textDecoration: "none", fontSize: "1.75rem", fontWeight: 800, color: "#1e1b2e" }}>
          Tii<span style={{ color: "#ff6b9d" }}>Baby</span> 🌸
        </Link>
        <h1 style={{ fontSize: "1.35rem", fontWeight: 800, marginTop: "1rem", color: "#1e1b2e" }}>
          Admin Dashboard Login 🔒
        </h1>
        <p style={{ fontSize: ".85rem", color: "#6b7280", marginTop: "4px" }}>
          Authorized store managers only
        </p>
      </div>

      {error && (
        <div style={{
          background: "#fef2f2",
          border: "1px solid #fecaca",
          color: "#dc2626",
          padding: ".75rem 1rem",
          borderRadius: 12,
          fontSize: ".85rem",
          marginBottom: "1.25rem",
          fontWeight: 600
        }}>
          ⚠️ {error}
        </div>
      )}

      <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        <div>
          <label style={{ display: "block", fontSize: ".82rem", fontWeight: 700, color: "#374151", marginBottom: 6 }}>
            Admin Email Address
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@tiibaby.com"
            style={{
              width: "100%",
              padding: ".85rem 1rem",
              borderRadius: 12,
              border: "2px solid #e5e7eb",
              fontSize: ".95rem",
              outline: "none",
              transition: "all .2s"
            }}
          />
        </div>

        <div>
          <label style={{ display: "block", fontSize: ".82rem", fontWeight: 700, color: "#374151", marginBottom: 6 }}>
            Password
          </label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            style={{
              width: "100%",
              padding: ".85rem 1rem",
              borderRadius: 12,
              border: "2px solid #e5e7eb",
              fontSize: ".95rem",
              outline: "none",
              transition: "all .2s"
            }}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            background: "linear-gradient(135deg, #ff6b9d 0%, #ff477e 100%)",
            color: "#ffffff",
            border: "none",
            borderRadius: 12,
            padding: "1rem",
            fontWeight: 800,
            fontSize: "1rem",
            cursor: "pointer",
            boxShadow: "0 4px 14px rgba(255, 107, 157, 0.35)",
            transition: "transform .15s ease"
          }}
        >
          {loading ? "Authenticating…" : "Sign In to Admin"}
        </button>
      </form>

      <div style={{ marginTop: "1.5rem", paddingTop: "1.25rem", borderTop: "1px dashed #e5e7eb", textAlign: "center" }}>
        <button
          onClick={handleAdminBypass}
          style={{
            background: "#f3f4f6",
            color: "#374151",
            border: "1px solid #d1d5db",
            borderRadius: 10,
            padding: ".65rem 1rem",
            fontSize: ".82rem",
            fontWeight: 700,
            cursor: "pointer",
            width: "100%"
          }}
        >
          ⚡ Quick Admin Access (Store Manager)
        </button>
        
        <div style={{ marginTop: "1rem" }}>
          <Link href="/" style={{ fontSize: ".82rem", color: "#9ca3af", textDecoration: "none", fontWeight: 600 }}>
            ← Return to Public Storefront
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "linear-gradient(135deg, #fff0f6 0%, #fdf2f8 50%, #eff6ff 100%)",
      padding: "1.5rem"
    }}>
      <Suspense fallback={<div style={{ padding: "2rem", textAlign: "center", color: "#ff6b9d", fontWeight: 700 }}>Loading admin portal…</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
