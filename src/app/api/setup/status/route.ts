import { NextResponse } from "next/server";
import { needsSetup } from "@/lib/setup";

export async function GET() {
  const required = await needsSetup();
  return NextResponse.json({ needsSetup: required });
}
