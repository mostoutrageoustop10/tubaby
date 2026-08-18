import { NextResponse } from "next/server";
import { getProduct, updateProduct, deleteProduct } from "@/lib/products";
export const dynamic = "auto";
export async function GET(_req, { params }) {
  try { const p = await getProduct(params.id); return p ? NextResponse.json(p) : NextResponse.json({ error:"Not found" }, { status:404 }); }
  catch (err) { return NextResponse.json({ error:err.message }, { status:500 }); }
}
export async function PATCH(request, { params }) {
  try { const u = await updateProduct(params.id, await request.json()); return u ? NextResponse.json(u) : NextResponse.json({ error:"Not found" }, { status:404 }); }
  catch (err) { return NextResponse.json({ error:err.message }, { status:500 }); }
}
export async function DELETE(_req, { params }) {
  try { await deleteProduct(params.id); return NextResponse.json({ ok:true }); }
  catch (err) { return NextResponse.json({ error:err.message }, { status:500 }); }
}
