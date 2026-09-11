import { NextResponse } from "next/server";
import { auth } from "@/server/auth";

// /login et /inscription doivent rester joignables sans session (sinon
// boucle de redirection), mais ont quand meme besoin du nonce CSP pour leur
// propre rendu (le script d'initialisation du theme dans layout.tsx
// s'applique a toutes les pages) -- l'exclusion se fait donc ici, dans le
// corps de la fonction, plutot que dans le matcher comme avant Next.js 16.
const PUBLIC_PATHS = ["/login", "/inscription"];

export default auth((req) => {
  const isDev = process.env.NODE_ENV === "development";
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  // style-src reste en 'unsafe-inline' : le design system s'appuie
  // massivement sur des style={{ ... }} React (var(--ink) etc, une
  // trentaine de composants) -- ce sont des attributs "style", couverts par
  // style-src-attr (qui herite de style-src), jamais par un nonce (le nonce
  // CSP ne s'applique qu'aux balises <style> et <script>, pas aux
  // attributs). Les reecrire en classes CSS pour satisfaire ce point precis
  // serait un chantier disproportionne face au risque reel (l'injection de
  // style est un vecteur bien plus faible que l'injection de script, seule
  // protegee par nonce ci-dessous).
  const cspHeader = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""};
    style-src 'self' 'unsafe-inline';
    img-src 'self' https: data: blob:;
    font-src 'self';
    connect-src 'self';
    worker-src 'self';
    manifest-src 'self';
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    upgrade-insecure-requests;
  `
    .replace(/\s{2,}/g, " ")
    .trim();

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", cspHeader);

  const isPublicPath = PUBLIC_PATHS.includes(req.nextUrl.pathname);

  // req.auth?.user (pas seulement req.auth) : defense en profondeur
  // recommandee par l'advisory NextAuth GHSA-8fpg-xm3f-6cx3 -- une config
  // invalide peut faire renvoyer un objet tronque mais truthy par auth(),
  // beta.32 corrige deja le fail-open cote librairie, ceci n'est qu'une
  // securite supplementaire si jamais ce comportement revenait.
  if (!isPublicPath && !req.auth?.user) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    const response = NextResponse.redirect(loginUrl);
    response.headers.set("Content-Security-Policy", cspHeader);
    return response;
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", cspHeader);
  return response;
});

export const config = {
  // Tout /api/* est exclu : chaque route API fait deja sa propre verification
  // via requireUserId() et renvoie un 401 JSON propre (section 37) plutot
  // qu'une redirection HTML vers /login -- indispensable pour un vrai
  // consommateur d'API (section 31), et pour un futur capteur IoT qui
  // s'authentifie par jeton plutot que par session (section 22). /login et
  // /inscription restent dans le matcher (voir PUBLIC_PATHS ci-dessus) pour
  // recevoir le nonce CSP.
  matcher: [
    // .well-known : verification de domaine pour le TWA (empaquetage
    // Android), doit rester joignable sans session.
    "/((?!api|_next/static|_next/image|favicon.ico|icons|uploads|manifest.json|sw.js|\\.well-known).*)",
  ],
  // Next.js 16 : le runtime Node.js est desormais le seul possible pour
  // proxy.ts (ex-middleware.ts) -- fixer `runtime` dans la config leve une
  // erreur au build, l'option n'existe plus.
};
