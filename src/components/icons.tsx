import type { ComponentType, ReactNode, SVGProps } from "react";

/**
 * Jeu d'icones "papier decoupe" : silhouettes pleines et epaisses, details
 * decoupes dans la forme (trous en fill-rule evenodd), traits arrondis et
 * larges, deuxieme ton en transparence. Remplace lucide-react dans toute
 * l'application ; l'API est la meme (size, className, style...), le
 * strokeWidth passe par les appelants est volontairement ignore : le trait
 * fait partie du style.
 */

export type IconProps = Omit<SVGProps<SVGSVGElement>, "ref"> & { size?: number | string };
export type LucideIcon = ComponentType<IconProps>;

function Svg({ size = 24, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
      strokeWidth={undefined}
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** Traits epais et arrondis (fleches, croix, coche...). */
function Lines({ w = 2.6, children }: { w?: number; children: ReactNode }) {
  return (
    <g fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </g>
  );
}

/** Forme contournee avec un remplissage teinte : le "deuxieme ton". */
function Tinted({ d, w = 2.4, tint = 0.28 }: { d: string; w?: number; tint?: number }) {
  return (
    <path
      d={d}
      fill="currentColor"
      fillOpacity={tint}
      stroke="currentColor"
      strokeWidth={w}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

const make = (render: () => ReactNode) =>
  function Icon(props: IconProps) {
    return <Svg {...props}>{render()}</Svg>;
  };

/* ---------- Plantes et nature ---------- */

export const Sprout = make(() => (
  <>
    <path d="M12 22v-9.5" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" />
    <path d="M12 14C12 9 8.8 6 3.8 6c0 5 3 8 8.2 8Z" />
    <path d="M12 11.5c0-4.2 2.7-6.9 8-6.9 0 4.4-2.9 6.9-8 6.9Z" fillOpacity={0.6} />
  </>
));

export const Leaf = make(() => (
  <path
    fillRule="evenodd"
    d="M4.5 20.5C4.5 11 10 4.5 20.5 3.5c0 10.5-5.6 17-14 17h-2Zm2.1-2.1 9.4-9.4.9.9-9.4 9.4Z"
  />
));

export const Droplets = make(() => (
  <>
    <path d="M10 3.3S4.4 9.8 4.4 14.2a5.6 5.6 0 0 0 11.2 0C15.6 9.8 10 3.3 10 3.3Z" />
    <path d="M17.6 9.6s-3 3.3-3 5.5a3 3 0 0 0 6 0c0-2.2-3-5.5-3-5.5Z" fillOpacity={0.55} />
  </>
));

export const Sun = make(() => (
  <>
    <circle cx={12} cy={12} r={4.7} />
    <Lines w={2.5}>
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <path key={a} d="M12 2.6v2.4" transform={`rotate(${a} 12 12)`} />
      ))}
    </Lines>
  </>
));

export const Shovel = make(() => (
  // Pot de fleurs : c'est le geste "rempoter" dans l'app.
  <>
    <path d="M5 10h14l-1.5 9.3A2 2 0 0 1 15.5 21h-7a2 2 0 0 1-2-1.7Z" />
    <rect x={3} y={5.5} width={18} height={5} rx={1.6} fillOpacity={0.6} />
  </>
));

export const Scissors = make(() => (
  <>
    <Tinted d="M9 6.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM9 17.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    <Lines w={2.5}>
      <path d="M8.6 8.4 21 17.5M8.6 15.6 21 6.5" />
    </Lines>
  </>
));

/* ---------- Navigation et actions ---------- */

export const Home = make(() => (
  <path
    fillRule="evenodd"
    d="M12 2.6 1.9 11.4c-.6.5-.2 1.6.6 1.6H4v7c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-7h1.5c.8 0 1.2-1.1.6-1.6Zm-2 19v-5.6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5.6Z"
  />
));

export const Settings = make(() => (
  <>
    <Lines w={3.4}>
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <path key={a} d="M12 2.6v3.4" transform={`rotate(${a} 12 12)`} strokeLinecap="butt" />
      ))}
    </Lines>
    <path
      fillRule="evenodd"
      d="M12 5.4a6.6 6.6 0 1 0 0 13.2 6.6 6.6 0 0 0 0-13.2Zm0 3.8a2.8 2.8 0 1 1 0 5.6 2.8 2.8 0 0 1 0-5.6Z"
    />
  </>
));

export const Wrench = make(() => (
  // Boite a outils : l'onglet "Outils".
  <>
    <Lines w={2.4}>
      <path d="M8.5 8.5V6.6a1.9 1.9 0 0 1 1.9-1.9h3.2a1.9 1.9 0 0 1 1.9 1.9v1.9" />
    </Lines>
    <path
      fillRule="evenodd"
      d="M5.5 8h13a2.5 2.5 0 0 1 2.5 2.5v8A2.5 2.5 0 0 1 18.5 21h-13A2.5 2.5 0 0 1 3 18.5v-8A2.5 2.5 0 0 1 5.5 8Zm5.2 4.4a.8.8 0 0 0-.8.8v2.2a.8.8 0 0 0 .8.8h2.6a.8.8 0 0 0 .8-.8v-2.2a.8.8 0 0 0-.8-.8Z"
    />
  </>
));

export const X = make(() => (
  <Lines w={2.8}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Lines>
));

export const Plus = make(() => (
  <Lines w={2.8}>
    <path d="M12 5v14M5 12h14" />
  </Lines>
));

export const Check = make(() => (
  <Lines w={3}>
    <path d="M5 12.5 10 17.5 19 7" />
  </Lines>
));

export const ChevronRight = make(() => (
  <Lines w={2.8}>
    <path d="M9 5l7 7-7 7" />
  </Lines>
));
export const ChevronLeft = make(() => (
  <Lines w={2.8}>
    <path d="M15 5l-7 7 7 7" />
  </Lines>
));
export const ChevronDown = make(() => (
  <Lines w={2.8}>
    <path d="M5 9l7 7 7-7" />
  </Lines>
));

export const ArrowUpDown = make(() => (
  <Lines w={2.4}>
    <path d="M8 20V5M4.5 8.5 8 5l3.5 3.5M16 4v15M12.5 15.5 16 19l3.5-3.5" />
  </Lines>
));

export const ExternalLink = make(() => (
  <Lines w={2.4}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
  </Lines>
));

export const Loader2 = make(() => (
  <Lines w={2.8}>
    <path d="M12 3a9 9 0 1 0 9 9" />
  </Lines>
));

export const Search = make(() => (
  <>
    <Tinted d="M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Z" w={2.6} />
    <Lines w={2.8}>
      <path d="M15.5 15.5 21 21" />
    </Lines>
  </>
));

export const ScanSearch = make(() => (
  <>
    <Lines w={2.4}>
      <path d="M3 8V6a3 3 0 0 1 3-3h2M16 3h2a3 3 0 0 1 3 3v2M21 16v2a3 3 0 0 1-3 3h-2M8 21H6a3 3 0 0 1-3-3v-2M14.4 14.4l3.1 3.1" />
    </Lines>
    <Tinted d="M11.5 7.9a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2Z" w={2.4} />
  </>
));

export const SlidersHorizontal = make(() => (
  <>
    <Lines w={2.4}>
      <path d="M3 6h18M3 12h18M3 18h18" />
    </Lines>
    <circle cx={15} cy={6} r={2.8} />
    <circle cx={8} cy={12} r={2.8} />
    <circle cx={16.5} cy={18} r={2.8} />
  </>
));

export const Pencil = make(() => (
  <Tinted d="M15.4 4.6a2 2 0 0 1 2.9 0l1.1 1.1a2 2 0 0 1 0 2.9L8.6 19.4l-5 1 1-5Z" />
));

export const Trash2 = make(() => (
  <>
    <Lines w={2.6}>
      <path d="M4 6.5h16M9.5 6.5V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v1.5" />
    </Lines>
    <Tinted d="M6 8.5l.9 10.8A2 2 0 0 0 8.9 21h6.2a2 2 0 0 0 2-1.7L18 8.5Z" />
  </>
));

export const Eye = make(() => (
  <>
    <Tinted d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
    <circle cx={12} cy={12} r={3.2} />
  </>
));

export const Camera = make(() => (
  <>
    <path d="M8 7.5 9.2 5a1 1 0 0 1 .9-.6h3.8a1 1 0 0 1 .9.6L16 7.5Z" />
    <path
      fillRule="evenodd"
      d="M5.5 7h13A3 3 0 0 1 21.5 10v7.5a3 3 0 0 1-3 3h-13a3 3 0 0 1-3-3V10a3 3 0 0 1 3-3Zm6.5 3.2a3.9 3.9 0 1 0 0 7.8 3.9 3.9 0 0 0 0-7.8Z"
    />
    <circle cx={12} cy={14.1} r={1.7} />
  </>
));

/** Partage (trois noeuds relies). */
export const Share = make(() => (
  <>
    <Lines w={2.4}>
      <path d="M8.6 10.6 15.4 6.9M8.6 13.4l6.8 3.7" />
    </Lines>
    <circle cx={6} cy={12} r={3.2} />
    <circle cx={18} cy={5.5} r={3.2} />
    <circle cx={18} cy={18.5} r={3.2} />
  </>
));

/** Galerie (choisir une photo existante), pendant de Camera. */
export const Images = make(() => (
  <>
    <Tinted d="M5 4.5h14a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2Z" />
    <circle cx={8.6} cy={9.2} r={1.9} />
    <path d="M3.6 18.4 9.3 12.7l3.4 3.4 2.4-2.4 5.3 5.3v.3H3.6Z" />
  </>
));

export const Clock = make(() => (
  <>
    <Tinted d="M12 2.5a9.5 9.5 0 1 0 0 19 9.5 9.5 0 0 0 0-19Z" />
    <Lines w={2.4}>
      <path d="M12 7v5l3.5 2" />
    </Lines>
  </>
));

export const History = make(() => (
  <Lines w={2.4}>
    <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3.5 4v4.8h4.8M12 8v4l3 1.8" />
  </Lines>
));

/* ---------- Etats et alertes ---------- */

export const Star = ({ size = 24, fill, stroke, ...rest }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={fill ?? "none"}
    stroke={stroke ?? "currentColor"}
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
    {...rest}
  >
    <path d="M12 2.8l2.8 5.9 6.4.9-4.7 4.5 1.2 6.4L12 17.4l-5.7 3.1 1.2-6.4L2.8 9.6l6.4-.9Z" />
  </svg>
);

export const TriangleAlert = make(() => (
  <path
    fillRule="evenodd"
    d="M10.3 3.9 2.4 17.6A2 2 0 0 0 4.1 20.6h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0ZM11 9h2v5.3h-2Zm1 7.2a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Z"
  />
));

export const ShieldAlert = make(() => (
  <path
    fillRule="evenodd"
    d="M12 2.4 4 5.5v6c0 5 3.3 8.6 8 10.1 4.7-1.5 8-5.1 8-10.1v-6ZM11 8h2v5h-2Zm1 6.8a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Z"
  />
));

export const Ban = make(() => (
  <>
    <Tinted d="M12 2.5a9.5 9.5 0 1 0 0 19 9.5 9.5 0 0 0 0-19Z" w={2.6} />
    <Lines w={2.6}>
      <path d="M5.3 5.3l13.4 13.4" />
    </Lines>
  </>
));

export const XCircle = make(() => (
  <>
    <Tinted d="M12 2.5a9.5 9.5 0 1 0 0 19 9.5 9.5 0 0 0 0-19Z" />
    <Lines w={2.6}>
      <path d="M9 9l6 6M15 9l-6 6" />
    </Lines>
  </>
));

export const CheckCircle2 = make(() => (
  <>
    <Tinted d="M12 2.5a9.5 9.5 0 1 0 0 19 9.5 9.5 0 0 0 0-19Z" />
    <Lines w={2.6}>
      <path d="M7.8 12.6l2.9 2.9L16.4 9" />
    </Lines>
  </>
));

export const Flag = make(() => (
  <>
    <Lines w={2.6}>
      <path d="M5.5 21V4" />
    </Lines>
    <path d="M5.5 4.5h12.7l-2.7 4 2.7 4H5.5Z" />
  </>
));

/* ---------- Objets ---------- */

export const Thermometer = make(() => (
  <>
    <Tinted d="M9.6 12.5V5.5a2.4 2.4 0 0 1 4.8 0v7a4.6 4.6 0 1 1-4.8 0Z" />
    <circle cx={12} cy={17} r={2.6} />
    <Lines w={2.2}>
      <path d="M12 8v9" />
    </Lines>
  </>
));

export const Tag = make(() => (
  <path
    fillRule="evenodd"
    d="M3.5 12.4V4.5a1 1 0 0 1 1-1h7.9a1 1 0 0 1 .7.3l7.4 7.4a1 1 0 0 1 0 1.4l-7.9 7.9a1 1 0 0 1-1.4 0L3.8 13.1a1 1 0 0 1-.3-.7ZM8 6.6a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2Z"
  />
));

export const StickyNote = make(() => (
  <>
    <Tinted d="M6 3.5h12A2.5 2.5 0 0 1 20.5 6v8.5L14.5 20.5H6A2.5 2.5 0 0 1 3.5 18V6A2.5 2.5 0 0 1 6 3.5Z" />
    <Lines w={2.2}>
      <path d="M20 14.5h-4a1.5 1.5 0 0 0-1.5 1.5v4M8 9h8M8 13h4" />
    </Lines>
  </>
));

export const FileText = make(() => (
  <>
    <Tinted d="M7.5 3h6.6L19 7.9V19a2 2 0 0 1-2 2H7.5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
    <Lines w={2.2}>
      <path d="M9 12h6M9 16h6" />
    </Lines>
  </>
));

export const BookOpen = make(() => (
  <>
    <Tinted d="M12 6.5C10.4 4.9 7.7 4.2 3.5 4.2v13.6c4.2 0 6.9.7 8.5 2.3 1.6-1.6 4.3-2.3 8.5-2.3V4.2c-4.2 0-6.9.7-8.5 2.3Z" />
    <Lines w={2.2}>
      <path d="M12 6.5v13.6" />
    </Lines>
  </>
));

export const Layers = make(() => (
  <>
    <path d="M12 2.8 2.8 8 12 13.2 21.2 8Z" />
    <Lines w={2.4}>
      <path d="M3 12.2l9 5 9-5M3 16.2l9 5 9-5" />
    </Lines>
  </>
));

export const Container = make(() => (
  // Jardiniere : bac allonge avec une pousse.
  <>
    <path d="M12 9V5.5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" />
    <path d="M12 6.4c0-2.4-1.5-3.6-3.9-3.6 0 2.4 1.5 3.6 3.9 3.6Z" />
    <path d="M12 7.6c0-2 1.4-3.2 3.7-3.2 0 2-1.4 3.2-3.7 3.2Z" fillOpacity={0.6} />
    <rect x={2.5} y={9} width={19} height={4} rx={1.5} fillOpacity={0.6} />
    <path d="M4 13.5h16l-1.3 6.2a2 2 0 0 1-2 1.6H7.3a2 2 0 0 1-2-1.6Z" />
  </>
));

export const FlaskConical = make(() => (
  <>
    <Tinted d="M10 3.5v5.8L4.7 18.4a2 2 0 0 0 1.7 3.1h11.2a2 2 0 0 0 1.7-3.1L14 9.3V3.5" />
    <Lines w={2.4}>
      <path d="M8.8 3.5h6.4M7.4 15h9.2" />
    </Lines>
  </>
));

export const Gauge = make(() => (
  <>
    <Lines w={2.6}>
      <path d="M4.5 17.5a8.5 8.5 0 1 1 15 0M12 14.5l3.8-5" />
    </Lines>
    <circle cx={12} cy={15} r={2.2} />
  </>
));

export const Lightbulb = make(() => (
  <>
    <path d="M12 2.5a6.5 6.5 0 0 0-3.8 11.8c.5.4.8 1 .8 1.6v.6h6v-.6c0-.6.3-1.2.8-1.6A6.5 6.5 0 0 0 12 2.5Z" />
    <rect x={9.3} y={18.2} width={5.4} height={1.9} rx={0.95} fillOpacity={0.6} />
    <rect x={10.3} y={21} width={3.4} height={1.4} rx={0.7} fillOpacity={0.6} />
  </>
));

export const ListChecks = make(() => (
  <Lines w={2.4}>
    <path d="M3.5 6.2l1.6 1.6L8 4.8M3.5 12.2l1.6 1.6L8 10.8M3.5 18.2l1.6 1.6L8 16.8M12 6.5h9M12 12.5h9M12 18.5h9" />
  </Lines>
));

export const Megaphone = make(() => (
  <>
    <path d="M3.5 10.2v3.6a1 1 0 0 0 1 1H7l9.5 4.6V4.6L7 9.2H4.5a1 1 0 0 0-1 1Z" />
    <Lines w={2.4}>
      <path d="M19.8 9.2a4.2 4.2 0 0 1 0 5.6" />
    </Lines>
  </>
));

export const MessageCircle = make(() => (
  <path
    fillRule="evenodd"
    d="M12 2.8a9.2 9.2 0 0 0-7.9 13.9L3 21.2l4.7-1.2A9.2 9.2 0 1 0 12 2.8ZM8 10.9a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Zm4 0a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Zm4 0a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Z"
  />
));

export const Stethoscope = make(() => (
  <>
    <Lines w={2.4}>
      <path d="M5.5 3.5V9a4.5 4.5 0 0 0 9 0V3.5M10 13.5V16a5 5 0 0 0 10 0v-2.6" />
    </Lines>
    <circle cx={20} cy={11.4} r={2.4} />
  </>
));

export const UserRound = make(() => (
  <>
    <circle cx={12} cy={7.8} r={4.2} />
    <path d="M4.5 21a7.5 7.5 0 0 1 15 0Z" fillOpacity={0.6} />
  </>
));

export const MoreHorizontal = make(() => (
  <>
    <circle cx={5.5} cy={12} r={2.1} />
    <circle cx={12} cy={12} r={2.1} />
    <circle cx={18.5} cy={12} r={2.1} />
  </>
));
