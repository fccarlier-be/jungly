import { NextResponse } from "next/server";
import { auth } from "@/server/auth";

export default auth((req) => {
  // req.auth?.user (pas seulement req.auth) : defense en profondeur
  // recommandee par l'advisory NextAuth GHSA-8fpg-xm3f-6cx3 -- une config
  // invalide peut faire renvoyer un objet tronque mais truthy par auth(),
  // beta.32 corrige deja le fail-open cote librairie, ceci n'est qu'une
  // securite supplementaire si jamais ce comportement revenait.
  if (!req.auth?.user) {
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
  matcher: [
    // .well-known : verification de domaine pour le TWA (empaquetage
    // Android), doit rester joignable sans session.
    "/((?!api|login|inscription|_next/static|_next/image|favicon.ico|icons|uploads|manifest.json|sw.js|\\.well-known).*)",
  ],
  // Le runtime Node.js (stable depuis Next.js 15.2) evite d'embarquer
  // bcrypt/Prisma dans un bundle Edge : on deploie sur un conteneur Node
  // classique (Docker), pas sur un edge runtime type Vercel/Cloudflare.
  runtime: "nodejs",
};
