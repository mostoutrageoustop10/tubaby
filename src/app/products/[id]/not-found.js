import Link from "next/link";
import Nav from "@/components/Nav";

export default function ProductNotFound() {
  return (
    <>
      <Nav />
      <main
        style={{
          minHeight: "70vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
          textAlign: "center",
          gap: "1.25rem",
        }}
      >
        <span style={{ fontSize: "4rem" }}>🔍</span>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "#1f2937", margin: 0 }}>
          Product not found
        </h1>
        <p style={{ color: "#6b7280", maxWidth: 380, margin: 0 }}>
          We couldn&apos;t find the product you were looking for. It may have been removed
          or the link might be incorrect.
        </p>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", justifyContent: "center" }}>
          <Link
            href="/"
            style={{
              padding: ".75rem 1.5rem",
              background: "var(--pink, #ec4899)",
              color: "#fff",
              borderRadius: 10,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            🛍️ Back to Shop
          </Link>
          <Link
            href="/shop"
            style={{
              padding: ".75rem 1.5rem",
              background: "#f3f4f6",
              color: "#374151",
              borderRadius: 10,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Browse All Products
          </Link>
        </div>
      </main>
    </>
  );
}
