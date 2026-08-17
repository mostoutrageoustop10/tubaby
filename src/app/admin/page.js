import Nav         from "@/components/Nav";
import AdminClient from "./AdminClient";
import { getAllProducts, FALLBACK_PRODUCTS } from "@/lib/products";
export const dynamic = "force-dynamic";
export default async function AdminPage() {
  let products;
  try { products = await getAllProducts(); }
  catch { products = FALLBACK_PRODUCTS; }
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
