"use client";

import { useEffect, useState } from "react";

type Theme = "system" | "light" | "dark";

function applyTheme(theme: Theme) {
  if (theme === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", theme);
  }
}

export default function ThemeToggle() {
  // "light" par defaut (coherent avec le script d'initialisation dans
  // layout.tsx) : sans choix enregistre, l'appli demarre en clair, pas en
  // suivant le systeme.
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    try {
      const stored = localStorage.getItem("theme");
      if (stored === "light" || stored === "dark" || stored === "system") {
        setTheme(stored);
      }
    } catch {
      // localStorage indisponible (navigation privee, etc.) : reste sur "light".
    }
  }, []);

  function choose(next: Theme) {
    setTheme(next);
    applyTheme(next);
    try {
      // "system" est persiste tel quel (pas supprime) pour rester
      // distinguable d'une absence de choix, qui doit demarrer en clair.
      localStorage.setItem("theme", next);
    } catch {
      // Pas grave si non persiste : le choix reste actif pour cette page.
    }
  }

  const options: { value: Theme; label: string }[] = [
    { value: "system", label: "Système" },
    { value: "light", label: "Clair" },
    { value: "dark", label: "Sombre" },
  ];

  return (
    <div className="flex gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => choose(opt.value)}
          className={`chip flex-1 rounded-xl py-2 text-sm ${theme === opt.value ? "chip-active" : ""}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
