"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Sprout, ListChecks, Settings } from "lucide-react";

const ITEMS = [
  { href: "/", label: "Accueil", Icon: Home },
  { href: "/plantes", label: "Mes plantes", Icon: Sprout },
  { href: "/taches", label: "Tâches", Icon: ListChecks },
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
      className="fixed bottom-0 left-0 right-0 z-20 flex justify-around border-t py-1.5"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      aria-label="Navigation principale"
    >
      {ITEMS.map(({ href, label, Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className="flex min-w-[64px] flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[11px] transition-colors"
            style={{ color: active ? "var(--primary-strong)" : "var(--ink-muted)" }}
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
