import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { withPublicCors, publicCorsPreflight } from "@/lib/cors";
import { BETA_SIGNUP_LIMIT } from "@/server/betaSignup";

export function OPTIONS() {
  return publicCorsPreflight();
}

export async function GET() {
  const confirmed = await db.betaSignup.count({ where: { status: "CONFIRMED" } });
  return withPublicCors(NextResponse.json({ confirmed, limit: BETA_SIGNUP_LIMIT }));
}
