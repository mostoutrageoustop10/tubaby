import { NextResponse } from "next/server";
// Orders are handled via WhatsApp — no DB needed
export const dynamic = "auto";
export async function POST() { return NextResponse.json({ ok:true, message:"Order handled via WhatsApp" }); }
export async function GET()  { return NextResponse.json([]); }
