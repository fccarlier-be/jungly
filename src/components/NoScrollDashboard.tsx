"use client";

import { useEffect, useRef, type ReactNode } from "react";

const MOBILE_BREAKPOINT = 1024; // aligne sur le "lg" de Tailwind (voir layout.tsx : une tablette reste "mobile" pour la nav)

/**
 * Empeche la page d'accueil de scroller/rebondir sur mobile : le contenu
 * variable (taches du jour, prochaines echeances) defile dans sa propre
 * zone bornee a la hauteur restante de l'ecran, plutot que toute la page.
 * Desactive au-dela du breakpoint desktop (md), qui n'a pas les memes
 * contraintes de barres fixes en bas d'ecran.
 *
 * La limite basse de la zone de scroll est la position REELLE du haut de la
 * barre "Ma collection" (ou, a defaut, de la nav du bas) -- mesuree en
 * direct via [data-collection-bar]/[data-bottom-nav], jamais une hauteur
 * fixe devinee : un ancien espaceur a 176px codes en dur s'est desynchronise
 * a la moindre ligne ajoutee au-dessus (ex. le badge meteo).
 */
export default function NoScrollDashboard({ children }: { children: ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const html = document.documentElement;
    const previousOverflow = html.style.overflow;

    function apply() {
      const isMobile = window.innerWidth < MOBILE_BREAKPOINT;
      if (!isMobile || !scrollRef.current) {
        html.style.overflow = previousOverflow;
        if (scrollRef.current) scrollRef.current.style.maxHeight = "";
        return;
      }

      html.style.overflow = "hidden";
      // data-collection-bar en priorite (plus haute des deux quand presente) ;
      // a defaut (aucune plante, pas de collection), data-bottom-nav.
      const boundaryEl =
        document.querySelector<HTMLElement>("[data-collection-bar]") ??
        document.querySelector<HTMLElement>("[data-bottom-nav]");
      const boundary = boundaryEl ? boundaryEl.getBoundingClientRect().top : window.innerHeight;
      const top = scrollRef.current.getBoundingClientRect().top;
      scrollRef.current.style.maxHeight = `${Math.max(0, boundary - top)}px`;
    }

    apply();
    window.addEventListener("resize", apply);
    window.visualViewport?.addEventListener("resize", apply);

    // Filet de securite : si le contenu au-dessus (ou la barre du bas)
    // change de taille apres coup (police qui finit de charger, badge
    // meteo qui apparait apres son propre fetch, etc.), la mesure se
    // reajuste toute seule au lieu de rester perimee.
    const observer = new ResizeObserver(apply);
    observer.observe(document.body);

    return () => {
      html.style.overflow = previousOverflow;
      window.removeEventListener("resize", apply);
      window.visualViewport?.removeEventListener("resize", apply);
      observer.disconnect();
    };
  }, []);

  return (
    <div ref={scrollRef} className="overflow-y-auto lg:overflow-visible lg:!max-h-none">
      {children}
    </div>
  );
}
