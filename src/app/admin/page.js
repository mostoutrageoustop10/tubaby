import fs from "fs";
import path from "path";
import Nav from "@/components/Nav";
import AdminClient from "./AdminClient";
import { getAllProducts } from "@/lib/products";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminPage() {
  let products = [];
  try {
    products = await getAllProducts();
  } catch (err) {
    console.warn("AdminPage getAllProducts failed, checking products.json:", err?.message);
    try {
      const jsonPath = path.join(process.cwd(), "public", "products.json");
      if (fs.existsSync(jsonPath)) {
        const fileData = fs.readFileSync(jsonPath, "utf-8");
        const list = JSON.parse(fileData);
        if (Array.isArray(list)) products = list;
      }
    } catch {}
  }

  return (
    <>
      <Nav />
      <main className="page">
        <div className="page-title">⚙️ Admin — <span>Product Manager</span></div>
        <AdminClient initialProducts={products} />
      </main>
    </>
  );
}
