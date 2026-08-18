import { NextResponse } from "next/server";
import { getAllProducts, addProduct, exportCsv, FALLBACK_PRODUCTS } from "@/lib/products";
export const dynamic = "auto";
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const products = await getAllProducts();
    if (searchParams.get("format") === "csv") {
      return new NextResponse(exportCsv(products), { headers: { "Content-Type":"text/csv", "Content-Disposition":'attachment; filename="products.csv"' } });
    }
    return NextResponse.json(products);
  } catch { return NextResponse.json(FALLBACK_PRODUCTS); }
}
export async function POST(request) {
  try { return NextResponse.json(await addProduct(await request.json()), { status:201 }); }
  catch (err) { return NextResponse.json({ error:err.message }, { status:500 }); }
}
