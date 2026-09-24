import type { CSSProperties, ReactNode } from "react";

/**
 * Illustrations "jungle en papier decoupe" : des aplats de couleur empiles,
 * separes par une ombre douce (filtre #jg-cut, defini une fois par
 * <PaperDefs /> dans le layout). Aucun degrade : le relief vient de l'ombre.
 *
 * Composants serveur (aucun hook). Les <mask> de Monstera exigent un `id`
 * explicite et unique dans le document -- chaque appelant fournit un prefixe
 * deterministe (jamais de compteur global, qui desynchroniserait une
 * hydratation).
 */

export const PAPER = {
  nuit: "#0f2a20",
  sous: "#17503a",
  emer: "#1f7a4f",
  fou: "#3f9a58",
  pousse: "#a9c94a",
  soleil: "#f2b84b",
  corail: "#e2674a",
  corailD: "#c4523a",
  papier: "#f3ecd9",
} as const;
const C = PAPER;

const CUT = "url(#jg-cut)";
const f1 = (n: number) => Math.round(n * 10) / 10;

const leaflet = (L: number, W: number) =>
  `M0 0C${f1(L * 0.2)} ${f1(-W)} ${f1(L * 0.7)} ${f1(-W)} ${f1(L)} 0C${f1(L * 0.7)} ${f1(W)} ${f1(L * 0.2)} ${f1(W)} 0 0Z`;

/** Filtre d'ombre partage par toutes les illustrations. A rendre une fois. */
export function PaperDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
      <defs>
        <filter id="jg-cut" x="-15%" y="-15%" width="130%" height="140%">
          <feDropShadow dx="0" dy="1.6" stdDeviation="0.5" floodColor="#000" floodOpacity="0.3" result="a" />
          <feDropShadow in="a" dx="0" dy="5" stdDeviation="3.2" floodColor="#000" floodOpacity="0.22" />
        </filter>
      </defs>
    </svg>
  );
}

/** Pose un motif dont la base est en (0,0). `grow` (delai en s) anime l'apparition (splash). */
function Place({
  x,
  y,
  rot = 0,
  s = 1,
  grow,
  children,
}: {
  x: number;
  y: number;
  rot?: number;
  s?: number;
  grow?: number;
  children: ReactNode;
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
      {grow === undefined ? (
        children
      ) : (
        <g className="jg-grow" style={{ "--d": `${grow}s` } as CSSProperties}>
          {children}
        </g>
      )}
    </g>
  );
}

function Frond({
  len = 200,
  bend = -60,
  n = 14,
  L = 44,
  W = 9,
  spread = 58,
  c1 = C.fou,
  c2 = C.emer,
  rach = C.sous,
}: {
  len?: number;
  bend?: number;
  n?: number;
  L?: number;
  W?: number;
  spread?: number;
  c1?: string;
  c2?: string;
  rach?: string;
}) {
  let x = 0;
  let y = 0;
  let h = -90;
  const step = len / n;
  const dh = bend / n;
  let rachis = "M0 0";
  const leaves: ReactNode[] = [];
  for (let i = 1; i <= n; i++) {
    h += dh;
    x += Math.cos((h * Math.PI) / 180) * step;
    y += Math.sin((h * Math.PI) / 180) * step;
    rachis += `L${f1(x)} ${f1(y)}`;
    const t = i / n;
    const s = 0.45 + 0.55 * Math.sin(Math.PI * (0.12 + 0.72 * t));
    [-1, 1].forEach((k, j) => {
      leaves.push(
        <path
          key={`${i}-${k}`}
          d={leaflet(L * s, W * s)}
          transform={`translate(${f1(x)} ${f1(y)}) rotate(${f1(h + k * spread)})`}
          fill={(i + j) % 2 ? c1 : c2}
        />,
      );
    });
  }
  leaves.push(<path key="tip" d={leaflet(L * 0.7, W * 0.8)} transform={`translate(${f1(x)} ${f1(y)}) rotate(${f1(h)})`} fill={c1} />);
  return (
    <g filter={CUT}>
      <path d={rachis} fill="none" stroke={rach} strokeWidth={3} strokeLinecap="round" />
      {leaves}
    </g>
  );
}

const MONSTERA_BLADE = "M0 -8C-22 8 -64 8 -73 -42C-79 -84 -36 -132 0 -170C36 -132 79 -84 73 -42C64 8 22 8 0 -8Z";
const MONSTERA_SLITS = [
  [-96, -56, -20, -30],
  [-94, -92, -18, -62],
  [-76, -126, -16, -94],
  [-48, -152, -12, -124],
];
const MONSTERA_SLIT_PATH = MONSTERA_SLITS.map(([a, b, c, d]) => `M${a} ${b}L${c} ${d}M${-a} ${b}L${-c} ${d}`).join("");

function Monstera({ id, c1 = C.emer, c2 = C.fou }: { id: string; c1?: string; c2?: string }) {
  return (
    <>
      <mask id={id} maskUnits="userSpaceOnUse" x={-120} y={-180} width={240} height={200}>
        <rect x={-120} y={-180} width={240} height={200} fill="#fff" />
        <path d={MONSTERA_SLIT_PATH} stroke="#000" strokeWidth={7.5} strokeLinecap="round" fill="none" />
        <ellipse cx={-44} cy={-22} rx={3.6} ry={6.5} transform="rotate(30 -44 -22)" fill="#000" />
        <ellipse cx={44} cy={-22} rx={3.6} ry={6.5} transform="rotate(-30 44 -22)" fill="#000" />
      </mask>
      <g filter={CUT}>
        <g mask={`url(#${id})`}>
          <path d={MONSTERA_BLADE} fill={c1} />
          <path d={MONSTERA_BLADE} fill={c2} transform="translate(0 -70) scale(.8) translate(0 70)" />
        </g>
      </g>
      <path d="M0 -8L0 -156" stroke={C.papier} strokeOpacity={0.38} strokeWidth={2.5} strokeLinecap="round" />
    </>
  );
}

const BLADE = "M-13 0C-17 -80 -9 -150 0 -200C9 -150 17 -80 13 0Z";
function Blade({ c1 = C.pousse, c2 = C.sous, c3 = C.emer }: { c1?: string; c2?: string; c3?: string }) {
  return (
    <g filter={CUT}>
      <path d={BLADE} fill={c1} />
      <path d={BLADE} fill={c2} transform="scale(.66 .97)" />
      <path d={BLADE} fill={c3} transform="scale(.3 .9)" />
    </g>
  );
}

function Pot({ w = 84, h = 64 }: { w?: number; h?: number }) {
  const r = w / 2;
  return (
    <g filter={CUT}>
      <path d={`M${-r + 7} 14L${r - 7} 14L${r - 17} ${h}L${-r + 17} ${h}Z`} fill={C.corail} />
      <path d={`M${-r + 7} 14L${r - 7} 14L${r - 9} 34L${-r + 9} 34Z`} fill={C.corailD} opacity={0.5} />
      <rect x={-r} y={0} width={w} height={18} rx={4} fill={C.corail} />
      <rect x={-r} y={12} width={w} height={6} rx={3} fill={C.corailD} opacity={0.5} />
    </g>
  );
}

function wavePath(y: number, amp: number, ph: number, w: number, h: number): string {
  let d = `M0 ${h}L0 ${f1(y + amp * Math.sin(ph))}`;
  for (let x = 10; x <= w; x += 10) d += `L${x} ${f1(y + amp * Math.sin(ph + x / (w / 6.6)))}`;
  return `${d}L${w} ${h}Z`;
}
function Wave({ y, amp, ph, fill, w = 400, h = 190 }: { y: number; amp: number; ph: number; fill: string; w?: number; h?: number }) {
  return (
    <g filter={CUT}>
      <path d={wavePath(y, amp, ph, w, h)} fill={fill} />
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* En-tete de l'accueil : le decor suit l'heure                        */
/* ------------------------------------------------------------------ */

export type BannerVariant = "matin" | "aprem" | "nuit";

const VARIANTS = {
  matin: { sky: "#f8d9b4", sun: [C.soleil, "#f6c66a", "#fbe0a0"], sx: 300, sy: 108, h: ["#8fbf78", "#4ea060", "#1f7a4f"], f: [C.fou, C.emer], m: [C.pousse, C.fou] },
  aprem: { sky: "#cfe8dc", sun: ["#f6cf5c", "#f8dc86", "#fbeab0"], sx: 312, sy: 52, h: ["#7cc08a", "#3f9a58", "#17503a"], f: [C.pousse, C.fou], m: [C.fou, C.emer] },
  nuit: { sky: "#173a33", sun: null, sx: 310, sy: 56, h: ["#1e5a45", "#17503a", "#0f2a20"], f: [C.emer, C.sous], m: [C.fou, C.emer] },
} as const;

const STARS: Array<[number, number]> = [
  [40, 24], [90, 48], [130, 16], [180, 40], [230, 22], [270, 60], [330, 30], [370, 52], [60, 70], [210, 74],
];

/** Heure -> decor. Meme seuil que le message d'accueil : "Bonsoir" des 18 h. */
export function bannerVariantForHour(hour: number): BannerVariant {
  if (hour >= 18 || hour < 5) return "nuit";
  return hour < 12 ? "matin" : "aprem";
}

export function HomeBanner({ variant, className }: { variant: BannerVariant; className?: string }) {
  const v = VARIANTS[variant];
  return (
    <svg className={className} viewBox="0 0 400 190" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <rect width={400} height={190} fill={v.sky} />
      {variant === "nuit" ? (
        <>
          {STARS.map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r={1.6} fill={C.papier} opacity={0.8} />
          ))}
          <g filter={CUT}>
            <circle cx={v.sx} cy={v.sy} r={22} fill={C.papier} />
          </g>
          <circle cx={v.sx + 9} cy={v.sy - 5} r={19} fill={v.sky} />
        </>
      ) : (
        <>
          <circle cx={v.sx} cy={v.sy} r={46} fill={v.sun![2]} />
          <circle cx={v.sx} cy={v.sy} r={34} fill={v.sun![1]} />
          <g filter={CUT}>
            <circle cx={v.sx} cy={v.sy} r={22} fill={v.sun![0]} />
          </g>
        </>
      )}
      <Wave y={118} amp={10} ph={0.5} fill={v.h[0]} />
      <Wave y={141} amp={9} ph={2} fill={v.h[1]} />
      <Wave y={165} amp={7} ph={4} fill={v.h[2]} />
      <Place x={46} y={196} rot={-14} s={0.52}>
        <Monstera id="hb-m1" c1={v.m[0]} c2={v.m[1]} />
      </Place>
      <Place x={20} y={196} rot={8} s={0.8}>
        <Frond len={120} bend={-45} n={11} L={34} W={8} c1={v.f[0]} c2={v.f[1]} />
      </Place>
      <Place x={356} y={198} rot={18} s={0.5}>
        <Monstera id="hb-m2" c1={v.m[1]} c2={v.m[0]} />
      </Place>
      <Place x={384} y={196} rot={-8} s={0.78}>
        <Frond len={116} bend={45} n={11} L={34} W={8} c1={v.f[0]} c2={v.f[1]} />
      </Place>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Splash                                                              */
/* ------------------------------------------------------------------ */

export function SplashArt() {
  return (
    <svg className="jg-splash-art" viewBox="0 0 260 520" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
      <Place x={58} y={470} rot={4} s={0.95} grow={0.05}>
        <Frond len={210} bend={-66} n={14} L={42} W={9} />
      </Place>
      <Place x={202} y={470} rot={-4} s={0.95} grow={0.12}>
        <Frond len={210} bend={66} n={14} L={42} W={9} c1={C.pousse} c2={C.fou} />
      </Place>
      <Place x={102} y={470} rot={-8} s={0.82} grow={0.2}>
        <Blade />
      </Place>
      <Place x={160} y={470} rot={10} s={0.72} grow={0.26}>
        <Blade c1={C.soleil} c3={C.fou} />
      </Place>
      <Place x={130} y={462} rot={0} s={1.12} grow={0.32}>
        <Monstera id="sp-m1" />
      </Place>
      <Place x={70} y={468} rot={-30} s={0.66} grow={0.4}>
        <Monstera id="sp-m2" c1={C.fou} c2={C.pousse} />
      </Place>
      <Place x={192} y={468} rot={28} s={0.7} grow={0.46}>
        <Monstera id="sp-m3" c1={C.fou} c2={C.pousse} />
      </Place>
      <g className="jg-splash-hills">
        <Wave y={452} amp={8} ph={1} fill={C.sous} w={260} h={520} />
        <Wave y={482} amp={7} ph={3.4} fill={C.nuit} w={260} h={520} />
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Ecrans vides et connexion                                           */
/* ------------------------------------------------------------------ */

/** Pot vide avec une jeune pousse, devant un soleil. */
export function PotSprout({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 200 150" aria-hidden="true" focusable="false">
      <circle cx={100} cy={66} r={58} fill={C.soleil} opacity={0.28} />
      <circle cx={100} cy={66} r={42} fill={C.soleil} opacity={0.4} />
      <ellipse cx={100} cy={142} rx={40} ry={4} fill="#000" opacity={0.12} />
      <Place x={100} y={104}>
        <path d="M0 0V-34" stroke={C.sous} strokeWidth={3.6} strokeLinecap="round" />
        <g filter={CUT}>
          <path d={leaflet(30, 11)} transform="translate(0 -30) rotate(-32)" fill={C.fou} />
          <path d={leaflet(30, 11)} transform="translate(0 -30) rotate(-148)" fill={C.pousse} />
        </g>
      </Place>
      <Place x={100} y={96} s={0.86}>
        <Pot />
      </Place>
    </svg>
  );
}

/** Petit paysage calme (soleil, collines, deux feuillages) pour "rien a faire". */
export function RestScene({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 240 140" aria-hidden="true" focusable="false">
      <circle cx={170} cy={50} r={40} fill="#fbeab0" />
      <circle cx={170} cy={50} r={30} fill="#f8dc86" />
      <g filter={CUT}>
        <circle cx={170} cy={50} r={20} fill="#f6cf5c" />
      </g>
      <Wave y={92} amp={7} ph={0.6} fill="#7cc08a" w={240} h={140} />
      <Wave y={110} amp={6} ph={2.4} fill="#3f9a58" w={240} h={140} />
      <Wave y={126} amp={4} ph={4} fill={C.sous} w={240} h={140} />
      <Place x={40} y={146} rot={-10} s={0.6}>
        <Monstera id="rs-m1" />
      </Place>
      <Place x={16} y={144} rot={6} s={0.7}>
        <Frond len={100} bend={-40} n={10} L={30} W={7} />
      </Place>
      <Place x={214} y={146} rot={8} s={0.62}>
        <Monstera id="rs-m2" c1={C.fou} c2={C.pousse} />
      </Place>
    </svg>
  );
}

/** Cluster de feuillage pour l'en-tete de la page de connexion. */
export function LoginArt({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 200 110" aria-hidden="true" focusable="false">
      <Place x={50} y={116} rot={-6} s={0.62}>
        <Frond len={130} bend={-55} n={11} L={34} W={8} />
      </Place>
      <Place x={150} y={116} rot={6} s={0.62}>
        <Frond len={130} bend={55} n={11} L={34} W={8} c1={C.pousse} c2={C.fou} />
      </Place>
      <Place x={84} y={118} rot={-6} s={0.44}>
        <Blade />
      </Place>
      <Place x={118} y={118} rot={8} s={0.38}>
        <Blade c1={C.soleil} c3={C.fou} />
      </Place>
      <Place x={100} y={116} s={0.5}>
        <Monstera id="lg-m1" />
      </Place>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Pastilles de soin                                                   */
/* ------------------------------------------------------------------ */

const DISC_COLOR: Record<string, string> = {
  WATERING: "var(--care-watering)",
  FERTILIZING: "var(--care-fertilizing)",
  REPOTTING: "var(--care-repotting)",
  PRUNING: "var(--care-pruning)",
};

export function hasCareDisc(type: string): boolean {
  return type in DISC_COLOR;
}

export function CareDisc({ type, size = 40, className }: { type: string; size?: number; className?: string }) {
  if (!hasCareDisc(type)) return null;
  const paper = C.papier;
  let glyph: ReactNode = null;
  if (type === "WATERING") {
    glyph = (
      <>
        <path d="M44 21C44 21 29 39 29 50a15 15 0 0 0 30 0C59 39 44 21 44 21Z" fill={paper} />
        <path d="M37 51a7 7 0 0 0 6 6" fill="none" stroke={DISC_COLOR.WATERING} strokeWidth={3} strokeLinecap="round" style={{ stroke: DISC_COLOR.WATERING }} />
      </>
    );
  } else if (type === "FERTILIZING") {
    glyph = (
      <>
        <path d="M44 64V42" stroke={paper} strokeWidth={3.4} strokeLinecap="round" />
        <path d={leaflet(22, 8)} transform="translate(44 46) rotate(-38)" fill={paper} />
        <path d={leaflet(22, 8)} transform="translate(44 40) rotate(-142)" fill={paper} />
        <path d="M30 64H58" stroke={paper} strokeWidth={3.4} strokeLinecap="round" />
      </>
    );
  } else if (type === "REPOTTING") {
    glyph = (
      <>
        <path d="M28 42H60L56 63H32Z" fill={paper} />
        <rect x={25} y={35} width={38} height={9} rx={3} fill={paper} />
        <path d="M44 35V24" stroke={paper} strokeWidth={3.4} strokeLinecap="round" />
        <path d={leaflet(13, 5)} transform="translate(44 27) rotate(-35)" fill={paper} />
      </>
    );
  } else {
    glyph = (
      <>
        <path d={leaflet(40, 13)} transform="translate(26 60) rotate(-42)" fill={paper} />
        <path d="M30 28L60 58" strokeWidth={3} strokeDasharray="3 5" strokeLinecap="round" fill="none" style={{ stroke: DISC_COLOR.PRUNING }} />
      </>
    );
  }
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 88 88" aria-hidden="true" focusable="false">
      <g filter={CUT}>
        <circle cx={44} cy={44} r={34} style={{ fill: DISC_COLOR[type] }} />
      </g>
      {glyph}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Placeholders et fond                                                */
/* ------------------------------------------------------------------ */

/** Vignette sans photo : un feuillage sur un disque de papier (aucun mask, donc reutilisable en liste). */
export function PlantPlaceholder({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <rect width={100} height={100} fill="#dbe8d0" />
      <circle cx={50} cy={58} r={34} fill="#c9dcbb" />
      <Wave y={78} amp={4} ph={1} fill="#7cc08a" w={100} h={100} />
      <Wave y={88} amp={3} ph={3} fill={C.fou} w={100} h={100} />
      <Place x={38} y={96} rot={-8} s={0.32}>
        <Blade c1={C.pousse} c2={C.sous} c3={C.emer} />
      </Place>
      <Place x={64} y={96} rot={12} s={0.28}>
        <Blade c1={C.soleil} c2={C.sous} c3={C.fou} />
      </Place>
      <Place x={50} y={96} rot={0} s={0.42}>
        <Frond len={100} bend={0} n={9} L={30} W={7} c1={C.fou} c2={C.emer} />
      </Place>
    </svg>
  );
}

/** Feuillage de fond, tres discret, fixe derriere tout le contenu. */
export function BackgroundLeaves() {
  return (
    <div className="jg-bg" aria-hidden="true">
      <svg className="jg-bg-a" viewBox="0 0 300 340" preserveAspectRatio="xMaxYMax meet" focusable="false">
        <Place x={200} y={352} rot={10} s={1.5}>
          <Monstera id="bg-m1" c1={C.fou} c2={C.pousse} />
        </Place>
        <Place x={110} y={352} rot={-6} s={1}>
          <Frond len={250} bend={-62} n={15} L={46} W={10} c1={C.fou} c2={C.emer} />
        </Place>
        <Place x={262} y={352} rot={22} s={0.8}>
          <Blade c1={C.pousse} c2={C.sous} c3={C.emer} />
        </Place>
      </svg>
      <svg className="jg-bg-b" viewBox="0 0 300 340" preserveAspectRatio="xMinYMin meet" focusable="false">
        <Place x={120} y={-12} rot={186} s={1.15}>
          <Monstera id="bg-m2" c1={C.emer} c2={C.fou} />
        </Place>
        <Place x={210} y={-12} rot={170} s={0.9}>
          <Frond len={230} bend={56} n={14} L={42} W={9} c1={C.pousse} c2={C.fou} />
        </Place>
      </svg>
    </div>
  );
}
