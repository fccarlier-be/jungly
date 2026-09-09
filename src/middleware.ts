import { NextResponse } from "next/server";
import { auth } from "@/server/auth";

export default auth((req) => {
  if (!req.auth) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    return NextResponse.redirect(loginUrl);
  }
});

export const config = {
  // Tout /api/* est exclu : chaque route API fait deja sa propre verification
  // via requireUserId() et renvoie un 401 JSON propre (section 37) plutot
  // qu'une redirection HTML vers /login -- indispensable pour un vrai
  // consommateur d'API (section 31), et pour un futur capteur IoT qui
  // s'authentifie par jeton plutot que par session (section 22).
  matcher: ["/((?!api|login|_next/static|_next/image|favicon.ico|icons|uploads|manifest.json|sw.js).*)"],
  // Le runtime Node.js (stable depuis Next.js 15.2) evite d'embarquer
  // bcrypt/Prisma dans un bundle Edge : on deploie sur un conteneur Node
  // classique (Docker), pas sur un edge runtime type Vercel/Cloudflare.
  runtime: "nodejs",
};
