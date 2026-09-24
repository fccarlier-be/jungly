import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Lora, Inter, Fraunces } from "next/font/google";
import Script from "next/script";
import type { CSSProperties } from "react";
import { Leaf } from "lucide-react";
import "./globals.css";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { getLatestAnnouncement } from "@/server/announcements";
import BottomNav from "@/components/BottomNav";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";
import AuthSessionProvider from "@/components/AuthSessionProvider";
import AnnouncementModal from "@/components/AnnouncementModal";
import { PaperDefs, SplashArt } from "@/components/art/paper";

const lora = Lora({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700"],
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-logo",
  weight: ["700", "800"],
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

// Par defaut (aucun choix enregistre) : theme clair -- pas le theme du
// systeme, qui reste un choix explicite distinct ("Systeme" dans les
// parametres, persiste tel quel pour rester distinguable d'une absence de
// choix).
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var t = localStorage.getItem('theme');
    if (t === 'dark') { document.documentElement.setAttribute('data-theme', 'dark'); return; }
    if (t === 'system') { document.documentElement.removeAttribute('data-theme'); return; }
    document.documentElement.setAttribute('data-theme', 'light');
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
`;

export const metadata: Metadata = {
  title: "Jungly",
  description: "Suivi et entretien des plantes",
  manifest: "/manifest.json",
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Jungly",
  },
};

export const viewport: Viewport = {
  themeColor: "#2f4a34",
  width: "device-width",
  initialScale: 1,
};

// Splash une seule fois par demarrage a froid : sessionStorage est propre a
// la session de l'onglet/de l'app (une navigation ou un rechargement ne le
// rejoue pas). Le splash lui-meme est rendu cote serveur et s'efface par CSS.
const SPLASH_INIT_SCRIPT = `
(function () {
  try {
    if (sessionStorage.getItem('jungly-splash')) {
      document.documentElement.setAttribute('data-splash', 'seen');
    } else {
      sessionStorage.setItem('jungly-splash', '1');
    }
  } catch (e) {}
})();
`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  // Pose par proxy.ts (Content-Security-Policy, nonce different a chaque
  // requete) : necessaire pour que ce script inline soit autorise a
  // s'executer sous la CSP, sans recourir a 'unsafe-inline' pour script-src.
  const nonce = (await headers()).get("x-nonce");

  // Modale de nouveautes (voir AnnouncementModal.tsx) : seulement si une
  // annonce existe ET que ce compte ne l'a pas deja acquittee -- une seule
  // requete de plus au chargement, negligeable a cote des autres queries
  // deja faites par chaque page.
  let pendingAnnouncement: { id: string; title: string; body: string } | null = null;
  if (session?.user?.id) {
    const [latest, user] = await Promise.all([
      getLatestAnnouncement(),
      db.user.findUnique({ where: { id: session.user.id }, select: { lastSeenAnnouncementId: true } }),
    ]);
    if (latest && latest.id !== user?.lastSeenAnnouncementId) {
      pendingAnnouncement = latest;
    }
  }

  return (
    <html lang="fr" className={`${lora.variable} ${inter.variable} ${fraunces.variable}`}>
      <body className="min-h-screen antialiased font-sans">
        <Script id="theme-init" strategy="beforeInteractive" nonce={nonce ?? undefined}>
          {THEME_INIT_SCRIPT}
        </Script>
        <Script id="splash-init" strategy="beforeInteractive" nonce={nonce ?? undefined}>
          {SPLASH_INIT_SCRIPT}
        </Script>
        <PaperDefs />
        <div className="jg-splash" aria-hidden="true">
          <div className="jg-splash-stage">
            <SplashArt />
            <div className="jg-splash-wm">
              {"Jungly".split("").map((letter, i) => (
                <span key={i} style={{ "--i": i } as CSSProperties}>
                  {letter}
                </span>
              ))}
            </div>
            <div className="jg-splash-tag">Ta jungle, chez toi</div>
          </div>
        </div>
        <ServiceWorkerRegistration />
        {session?.user ? (
          <AuthSessionProvider>
            {pendingAnnouncement && <AnnouncementModal announcement={pendingAnnouncement} />}
            {/* Bascule shell mobile/desktop a lg (1024px), pas md (768px) :
                une tablette est plus large que 768px mais reste un appareil
                tactile -- elle doit garder la nav du bas, pas la barre
                laterale pensee pour souris/clavier. Le padding du contenu
                (ci-dessous) continue lui a s'elargir des md, pur cosmetique
                sans lien avec le choix de nav. */}
            <div className="pb-20 lg:pb-0 lg:flex">
              <aside
                className="hidden lg:flex lg:w-60 lg:flex-col lg:border-r lg:p-5 lg:gap-1"
                style={{ borderColor: "var(--border)" }}
              >
                <div
                  className="flex items-center gap-2 px-2 pb-6 pt-2 font-logo text-2xl font-bold"
                  style={{ color: "var(--primary-strong)" }}
                >
                  <Leaf size={20} strokeWidth={1.75} />
                  Jungly
                </div>
                <BottomNav variant="sidebar" />
              </aside>
              <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-6 md:px-8 md:py-10">{children}</main>
              <div className="lg:hidden">
                <BottomNav variant="bottom" />
              </div>
            </div>
          </AuthSessionProvider>
        ) : (
          <main>{children}</main>
        )}
      </body>
    </html>
  );
}
