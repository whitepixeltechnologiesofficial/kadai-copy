import { NextResponse, connection } from "next/server";

// Tells the browser which optional features are switched on.
// Only safe, non-secret flags go here.
export async function GET() {
  await connection(); // always read the live env value, never a build-time copy
  return NextResponse.json({ splitEnabled: process.env.SPLIT_ENABLED === "true" });
}
