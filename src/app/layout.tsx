import type { Metadata, Viewport } from "next";
import { Lora, Inter } from "next/font/google";
import Script from "next/script";
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

const THEME_INIT_SCRIPT = `
(function () {
  try {
    var t = localStorage.getItem('theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) {}
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
            <div className="pb-20 md:pb-0 md:flex">
              <aside
                className="hidden md:flex md:w-60 md:flex-col md:border-r md:p-5 md:gap-1"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="px-2 pb-6 pt-2 font-display text-xl font-semibold" style={{ color: "var(--primary-strong)" }}>
                  🌿 Jungly
                </div>
                <BottomNav variant="sidebar" />
              </aside>
              <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-6 md:px-8 md:py-10">{children}</main>
              <div className="md:hidden">
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
