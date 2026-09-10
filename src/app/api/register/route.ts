import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { handleApiError } from "@/lib/apiError";
import { registerSchema } from "@/server/validation/auth";

/** Inscription en libre-service : cree un compte, ouvert a quiconque connait l'URL (pas de verification email pour l'instant). */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, name } = registerSchema.parse(body);

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "Un compte existe déjà avec cet email." }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await db.user.create({ data: { email, passwordHash, name: name || null } });

    return NextResponse.json({ id: user.id, email: user.email }, { status: 201 });
  } catch (error) {
    // Verification prealable + creation ne sont pas atomiques : une
    // inscription concurrente sur le meme email tomberait ici plutot que
    // sur le check ci-dessus.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Un compte existe déjà avec cet email." }, { status: 409 });
    }
    return handleApiError(error);
  }
}
