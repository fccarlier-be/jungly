"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
// Icones lucide d'origine (retour utilisateur : preferees a celles en papier decoupe pour le menu).
import { Home, Sprout, Wrench, Settings } from "lucide-react";

// "Taches" a ete retiree de cette barre (retour utilisateur, 2026-09-23) :
// l'accueil affiche deja les taches du jour, la page complete reste
// accessible depuis le bas de "Mes plantes". La place liberee accueille
// "Outils" (bibliotheque, engrais, jardinieres, historique...), qui
// vivaient avant eparpilles dans Parametres.
const ITEMS = [
  { href: "/", label: "Accueil", Icon: Home },
  { href: "/plantes", label: "Mes plantes", Icon: Sprout },
  { href: "/outils", label: "Outils", Icon: Wrench },
  { href: "/parametres", label: "Paramètres", Icon: Settings },
];

export default function BottomNav({ variant }: { variant: "bottom" | "sidebar" }) {
  const pathname = usePathname();

  if (variant === "sidebar") {
    return (
      <nav className="flex flex-col gap-1">
        {ITEMS.map(({ href, label, Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors"
              style={
                active
                  ? { background: "var(--primary-soft)", color: "var(--primary-strong)" }
                  : { color: "var(--ink-muted)" }
              }
            >
              <Icon size={18} strokeWidth={2} />
              {label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav
      data-bottom-nav
      className="fixed bottom-0 left-0 right-0 z-20 flex justify-around border-t px-2 py-1.5"
      style={{
        borderColor: "var(--border)",
        background: "var(--surface)",
        boxShadow: "0 -8px 18px -12px rgba(15, 42, 32, 0.28)",
      }}
      aria-label="Navigation principale"
    >
      {ITEMS.map(({ href, label, Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className="flex min-w-[68px] flex-col items-center gap-0.5 rounded-2xl px-3 py-1.5 text-[11px] transition-colors"
            style={
              active
                ? {
                    color: "var(--primary-strong)",
                    background: "var(--primary-soft)",
                    boxShadow: "0 2px 0 color-mix(in srgb, var(--primary) 28%, transparent)",
                  }
                : { color: "var(--ink-muted)" }
            }
            aria-current={active ? "page" : undefined}
          >
            <Icon size={22} strokeWidth={active ? 2.4 : 2} />
            <span className={active ? "font-semibold" : undefined}>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
