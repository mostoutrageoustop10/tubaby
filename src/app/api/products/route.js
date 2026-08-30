import { NextResponse } from "next/server";
import { getAllProducts, addProduct, exportCsv } from "@/lib/products";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const products = await getAllProducts();
    if (searchParams.get("format") === "csv") {
      return new NextResponse(exportCsv(products), {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": 'attachment; filename="products.csv"',
        },
      });
    }
    return NextResponse.json(products);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const created = await addProduct(body);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

