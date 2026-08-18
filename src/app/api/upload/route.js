import { NextResponse } from "next/server";
import { mergeFromCsv } from "@/lib/products";
export const dynamic = "auto";
export async function POST(request) {
  try {
    const csvText = await request.text();
    if (!csvText.trim()) return NextResponse.json({ error:"Empty CSV" }, { status:400 });
    const products = await mergeFromCsv(csvText);
    return NextResponse.json({ products, count:products.length });
  } catch (err) { return NextResponse.json({ error:err.message }, { status:500 }); }
}
