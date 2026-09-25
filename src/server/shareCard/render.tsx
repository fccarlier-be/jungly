import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import sharp from "sharp";
import { CARD_SIZE, formatElapsed, type ShareFormat } from "@/lib/shareCard";
import { HEALTH_LABEL, type HealthLevel } from "@/lib/plantHealth";

/**
 * Dessin de la carte de partage (satori, via next/og). Contraintes du moteur
 * a garder en tete : mise en page flex uniquement, tout element a plusieurs
 * enfants doit porter display:flex, pas de variables CSS (couleurs en dur,
 * reprises du theme clair de globals.css), polices chargees explicitement
 * (.woff, pas .woff2).
 */

const C = {
  bg: "#f4f0e2",
  surface: "#fffdf6",
  surfaceAlt: "#ebe5cf",
  ink: "#16281d",
  muted: "#5c6b5f",
  border: "#ddd6bf",
  primary: "#17503a",
  primarySoft: "#dbe8d0",
  secondary: "#3f9a58",
};

const HEALTH_HEX: Record<HealthLevel, string> = {
  EXCELLENT: "#17503a",
  GOOD: "#3f9a58",
  FAIR: "#c98a3e",
  POOR: "#c4523a",
  CRITICAL: "#b3392f",
};

// Polices embarquees (public/fonts/share-card, licence OFL) : next/font ne
// fournit pas de fichier lisible par satori. Chargees une fois par process.
const FONT_DIR = path.join(process.cwd(), "public", "fonts", "share-card");
type CardFonts = NonNullable<NonNullable<ConstructorParameters<typeof ImageResponse>[1]>["fonts"]>;
let fontsPromise: Promise<CardFonts> | null = null;
function loadFonts(): Promise<CardFonts> {
  fontsPromise ??= Promise.all([
    readFile(path.join(FONT_DIR, "fraunces-latin-700-normal.woff")),
    readFile(path.join(FONT_DIR, "inter-latin-400-normal.woff")),
    readFile(path.join(FONT_DIR, "inter-latin-400-italic.woff")),
    readFile(path.join(FONT_DIR, "inter-latin-600-normal.woff")),
    readFile(path.join(FONT_DIR, "inter-latin-700-normal.woff")),
  ]).then(([fraunces, inter400, inter400i, inter600, inter700]) => [
    { name: "Fraunces", data: fraunces, weight: 700 as const, style: "normal" as const },
    { name: "Inter", data: inter400, weight: 400 as const, style: "normal" as const },
    { name: "Inter", data: inter400i, weight: 400 as const, style: "italic" as const },
    { name: "Inter", data: inter600, weight: 600 as const, style: "normal" as const },
    { name: "Inter", data: inter700, weight: 700 as const, style: "normal" as const },
  ]);
  return fontsPromise;
}

// Icone de l'appli (celle du manifeste PWA) pour la signature de la carte,
// reduite une fois pour toutes : satori embarquerait sinon les 192 px a
// chaque rendu. 2x la taille affichee, pour rester nette.
let appIconPromise: Promise<string | null> | null = null;
function loadAppIcon(): Promise<string | null> {
  appIconPromise ??= readFile(path.join(process.cwd(), "public", "icons", "icon-192.png"))
    .then((png) => sharp(png).resize(128, 128).png().toBuffer())
    .then((png) => `data:image/png;base64,${png.toString("base64")}`)
    // Icone absente : la signature reste en texte seul.
    .catch(() => null);
  return appIconPromise;
}

export function formatShortDate(date: Date): string {
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Brussels" });
}

export interface CardContent {
  name: string;
  scientificName: string | null;
  healthLevel: HealthLevel | null;
  since: Date;
  waterings: number;
  fertilizings: number;
  now: Date;
}

export interface SingleCard extends CardContent {
  mode: "single";
  photo: string | null;
}

export interface BeforeAfterCard extends CardContent {
  mode: "beforeAfter";
  before: { photo: string | null; date: Date };
  after: { photo: string | null; date: Date };
}

export type CardInput = SingleCard | BeforeAfterCard;

/** Dimensions des photos pour chaque format/mode -- partagees avec le chargement (recadrage exact). */
export function photoBox(format: ShareFormat, mode: CardInput["mode"]): { width: number; height: number } {
  const { width } = CARD_SIZE[format];
  const inner = width - 2 * PADDING[format];
  // Hauteurs ajustees a l'oeil sur un rendu reel : le reste de la carte
  // (titre, statistiques, pied) doit tenir sans laisser de grand vide.
  if (mode === "single") return { width: inner, height: format === "square" ? 640 : 1260 };
  return format === "square" ? { width: (inner - GAP) / 2, height: 700 } : { width: inner, height: 580 };
}

const PADDING: Record<ShareFormat, number> = { square: 44, story: 64 };
const GAP = 20;

function Photo({ src, width, height, radius }: { src: string | null; width: number; height: number; radius: number }) {
  if (!src) {
    return (
      <div
        style={{
          width,
          height,
          borderRadius: radius,
          background: C.primarySoft,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Leaf size={Math.min(width, height) / 4} color={C.secondary} />
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- rendu satori, pas du DOM
  return <img src={src} width={width} height={height} alt="" style={{ width, height, borderRadius: radius, objectFit: "cover" }} />;
}

function Leaf({ size, color }: { size: number; color: string }) {
  return <div style={{ width: size, height: size, background: color, borderRadius: `0 ${size}px 0 ${size}px`, display: "flex" }} />;
}

function Pill({ children, dot, big }: { children: string; dot?: string; big: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: big ? 14 : 10,
        background: C.surface,
        color: C.ink,
        borderRadius: 999,
        padding: big ? "12px 26px" : "8px 18px",
        fontFamily: "Inter",
        fontWeight: 600,
        fontSize: big ? 32 : 24,
        boxShadow: "0 4px 14px rgba(15, 42, 32, 0.18)",
      }}
    >
      {dot && <div style={{ width: big ? 20 : 16, height: big ? 20 : 16, borderRadius: 999, background: dot, display: "flex" }} />}
      {children}
    </div>
  );
}

function HealthPill({ level, big }: { level: HealthLevel | null; big: boolean }) {
  if (!level) return null;
  return (
    <Pill dot={HEALTH_HEX[level]} big={big}>
      {`Santé : ${HEALTH_LABEL[level].toLowerCase()}`}
    </Pill>
  );
}

function Stat({ value, label, big }: { value: string; label: string; big: boolean }) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        background: C.surface,
        border: `2px solid ${C.border}`,
        borderRadius: big ? 32 : 26,
        padding: big ? "26px 28px" : "18px 22px",
      }}
    >
      <div style={{ display: "flex", fontFamily: "Fraunces", fontWeight: 700, fontSize: big ? 54 : 40, color: C.primary }}>{value}</div>
      <div style={{ display: "flex", fontFamily: "Inter", fontSize: big ? 28 : 22, color: C.muted }}>{label}</div>
    </div>
  );
}

function Title({ name, scientificName, big, extra }: { name: string; scientificName: string | null; big: boolean; extra?: string }) {
  // Taille reduite pour un nom long : satori ne sait pas "ajuster au
  // conteneur", une valeur fixe debordait sur deux lignes serrees.
  const base = big ? 84 : 62;
  const fontSize = name.length > 26 ? base * 0.62 : name.length > 16 ? base * 0.8 : base;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: big ? 8 : 4 }}>
      <div style={{ display: "flex", fontFamily: "Fraunces", fontWeight: 700, fontSize, color: C.ink, lineHeight: 1.1 }}>{name}</div>
      {scientificName && (
        <div style={{ display: "flex", fontFamily: "Inter", fontStyle: "italic", fontSize: big ? 34 : 28, color: C.muted }}>{scientificName}</div>
      )}
      {extra && (
        <div style={{ display: "flex", fontFamily: "Inter", fontWeight: 600, fontSize: big ? 34 : 28, color: C.secondary }}>{extra}</div>
      )}
    </div>
  );
}

function Footer({ big, icon }: { big: boolean; icon: string | null }) {
  const size = big ? 76 : 58;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12 }}>
      <div style={{ display: "flex", fontFamily: "Inter", fontSize: big ? 28 : 22, color: C.muted }}>suivie avec</div>
      {icon && (
        // eslint-disable-next-line @next/next/no-img-element -- rendu satori, pas du DOM
        <img src={icon} width={size} height={size} alt="" style={{ width: size, height: size, borderRadius: size * 0.22 }} />
      )}
      <div style={{ display: "flex", fontFamily: "Fraunces", fontWeight: 700, fontSize: big ? 44 : 34, color: C.primary }}>Jungly</div>
    </div>
  );
}

function CornerLabel({ label, date, big }: { label: string; date: Date; big: boolean }) {
  return (
    <div style={{ position: "absolute", left: big ? 24 : 16, bottom: big ? 24 : 16, display: "flex" }}>
      <Pill big={big}>{`${label} · ${formatShortDate(date)}`}</Pill>
    </div>
  );
}

function Card({ format, card, icon }: { format: ShareFormat; card: CardInput; icon: string | null }) {
  const { width, height } = CARD_SIZE[format];
  const big = format === "story";
  const pad = PADDING[format];
  const box = photoBox(format, card.mode);
  const radius = big ? 44 : 34;

  const stats = (
    <div style={{ display: "flex", gap: GAP }}>
      <Stat value={formatElapsed(card.since, card.now)} label="dans ma jungle" big={big} />
      <Stat value={String(card.waterings)} label={card.waterings > 1 ? "arrosages" : "arrosage"} big={big} />
      <Stat value={String(card.fertilizings)} label="engrais" big={big} />
    </div>
  );

  let photos;
  if (card.mode === "single") {
    photos = (
      <div style={{ position: "relative", display: "flex" }}>
        <Photo src={card.photo} width={box.width} height={box.height} radius={radius} />
        {card.healthLevel && (
          <div style={{ position: "absolute", left: big ? 24 : 18, top: big ? 24 : 18, display: "flex" }}>
            <HealthPill level={card.healthLevel} big={big} />
          </div>
        )}
      </div>
    );
  } else {
    photos = (
      <div style={{ display: "flex", flexDirection: big ? "column" : "row", gap: GAP }}>
        <div style={{ position: "relative", display: "flex" }}>
          <Photo src={card.before.photo} width={box.width} height={box.height} radius={radius} />
          <CornerLabel label="Avant" date={card.before.date} big={big} />
        </div>
        <div style={{ position: "relative", display: "flex" }}>
          <Photo src={card.after.photo} width={box.width} height={box.height} radius={radius} />
          <CornerLabel label="Après" date={card.after.date} big={big} />
        </div>
      </div>
    );
  }

  const elapsed = card.mode === "beforeAfter" ? `${formatElapsed(card.before.date, card.after.date)} d'écart` : undefined;

  return (
    <div
      style={{
        width,
        height,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: C.bg,
        padding: pad,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: big ? 40 : 24 }}>
        {photos}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20 }}>
          <Title name={card.name} scientificName={card.scientificName} big={big} extra={elapsed} />
          {card.mode === "beforeAfter" && <HealthPill level={card.healthLevel} big={big} />}
        </div>
        {/* Avant/apres carre : pas de place pour les statistiques, les
            photos sont le sujet. En story, il reste la place. */}
        {(card.mode === "single" || big) && stats}
      </div>
      <Footer big={big} icon={icon} />
    </div>
  );
}

/** PNG de la carte. */
export async function renderShareCard(format: ShareFormat, card: CardInput): Promise<ImageResponse> {
  const { width, height } = CARD_SIZE[format];
  const [fonts, icon] = await Promise.all([loadFonts(), loadAppIcon()]);
  return new ImageResponse(<Card format={format} card={card} icon={icon} />, {
    width,
    height,
    fonts,
    headers: { "Cache-Control": "private, no-store" },
  });
}
