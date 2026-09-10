import type { Metadata, Viewport } from "next";
import { Lora, Inter } from "next/font/google";
import Script from "next/script";
import { Leaf } from "lucide-react";
import "./globals.css";
import { auth } from "@/server/auth";
import BottomNav from "@/components/BottomNav";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";
import AuthSessionProvider from "@/components/AuthSessionProvider";

const lora = Lora({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700"],
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  return (
    <html lang="fr" className={`${lora.variable} ${inter.variable}`}>
      <body className="min-h-screen antialiased font-sans">
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
        <ServiceWorkerRegistration />
        {session?.user ? (
          <AuthSessionProvider>
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
                  className="flex items-center gap-2 px-2 pb-6 pt-2 font-display text-xl font-semibold"
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
