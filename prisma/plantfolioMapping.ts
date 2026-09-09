/**
 * Mapping du dataset plantfolio-common-plants (952 plantes, CC BY-NC-SA 4.0,
 * https://github.com/Luminoid/plantfolio-common-plants -- sources citees :
 * Plants of the World Online/Kew pour la nomenclature, ASPCA pour la
 * toxicite, USDA pour les zones de rusticite) vers notre `LibraryCareProfile`.
 *
 * Import statique en local (pas d'API live) : le fichier `plantfolioData.json`
 * est une copie telechargee une fois de `dist/common_plants.json`, seedee
 * comme n'importe quelle autre entree de bibliotheque (source="PLANTFOLIO").
 */
import type { LibraryCareProfile } from "./librarySeed";

export interface PlantfolioRawEntry {
  id: string;
  typeName: string;
  description?: string;
  commonExamples?: string;
  careTips?: string;
  origin?: string;
  springInterval?: number | null;
  summerInterval?: number | null;
  fallInterval?: number | null;
  winterInterval?: number | null;
  lightPreference?: string;
  humidityPreference?: string;
  temperaturePreference?: [number, number];
  plantToxicity?: string;
  soilPhPreference?: string;
  drainagePreference?: string;
  wateringMethod?: string;
  plantLifeSpan?: [number, number];
  category?: string;
  hardinessZones?: [number, number];
  growthRate?: string;
  propagationMethods?: string[];
}

const LIGHT_LABEL: Record<string, string> = {
  lowIndirect: "Lumière faible indirecte",
  mediumIndirect: "Lumière moyenne indirecte",
  brightIndirect: "Lumière vive indirecte",
  strongDirect: "Lumière directe forte",
  outdoorPartialSun: "Extérieur, mi-ombre",
  outdoorFullSun: "Extérieur, plein soleil",
  outdoorShade: "Extérieur, ombre",
};

const HUMIDITY_LABEL: Record<string, string> = { low: "Faible", medium: "Moyenne", high: "Élevée", veryHigh: "Très élevée" };
const TOXICITY_LABEL: Record<string, string> = {
  toxic: "Toxique",
  mildlyToxic: "Légèrement toxique",
  nonToxic: "Non toxique",
  unknown: "Inconnue",
};
const PH_LABEL: Record<string, string> = { neutral: "neutre", acidic: "acide", adaptable: "adaptable", alkaline: "alcalin" };
const DRAINAGE_LABEL: Record<string, string> = {
  wellDraining: "bien drainant",
  excellentDrainage: "drainage excellent",
  moistureRetentive: "retient l'humidité",
  waterloggingTolerant: "tolère l'engorgement",
};
const GROWTH_LABEL: Record<string, string> = { slow: "lente", moderate: "modérée", fast: "rapide" };
const PROPAGATION_LABEL: Record<string, string> = {
  stemCuttings: "bouturage de tige",
  division: "division",
  airLayering: "marcottage aérien",
  leafCuttings: "bouturage de feuille",
  layering: "marcottage",
  seeds: "semis",
  plantlets: "plantules",
  offsets: "rejets",
  tuberDivision: "division de tubercule",
  spores: "spores",
  runners: "stolons",
  grafting: "greffe",
  bulbDivision: "division de bulbe",
};

/**
 * `commonExamples` est un texte libre ("Cosmos bipinnatus (Garden cosmos), C.
 * sulphureus..."), pas un champ structure -- meilleur effort pour en extraire
 * le premier binome latin. Genre seul ou hybride intergenerique (x Genus) non
 * couverts : on laisse alors `scientificName` a null plutot que de deviner.
 */
// "spp"/"sp"/"cv"/"var" ne sont pas des epithetes d'espece mais des
// abreviations signifiant "plusieurs especes de ce genre" -- les traiter
// comme un binome ("Echinopsis spp") produit un faux nom scientifique
// injoignable dans aucune API externe. On retombe alors sur le genre seul.
const NOT_A_SPECIES_EPITHET = new Set(["spp", "sp", "cv", "var", "cvs"]);

export function extractScientificName(commonExamples?: string): string | null {
  if (!commonExamples) return null;
  // Le marqueur d'hybride (x/×) exige un espace de chaque cote : sans ca,
  // le "x" interne a un genre comme "Saxifraga" ou "Buxus" est backtracke
  // par le moteur regex et pris a tort pour ce marqueur (bug reel observe :
  // "Saxifraga (Saxifrage)..." -> genre extrait "Sa" + marqueur "x" +
  // "ifraga" -> "Sa ifraga").
  const m = commonExamples.match(/^([A-Z][a-z]+)(?:\s[×x]\s|\s+)([a-z][a-z-]+)/);
  if (m) return NOT_A_SPECIES_EPITHET.has(m[2].toLowerCase()) ? m[1] : `${m[1]} ${m[2]}`;
  // Pas d'epithete d'espece exploitable (ex. "Allium (Ornamental onion), A.
  // giganteum...", "Bonsai" n'etant meme pas un taxon) -- repli sur le genre
  // seul quand il est identifiable : toujours mieux qu'aucun nom, et rend la
  // fiche cherchable (recherche/photo) au moins au niveau du genre. La
  // logique anti-doublon de `seedPlantfolio` s'occupe des collisions.
  const genusOnly = commonExamples.match(/^([A-Z][a-z]+)\b/);
  return genusOnly ? genusOnly[1] : null;
}

function averageInterval(entry: PlantfolioRawEntry): number | null {
  const values = [entry.springInterval, entry.summerInterval, entry.fallInterval, entry.winterInterval].filter(
    (v): v is number => typeof v === "number" && v > 0,
  );
  if (values.length === 0) return null;
  return Math.max(1, Math.round(values.reduce((a, b) => a + b, 0) / values.length));
}

export interface MappedLibraryEntry {
  commonName: string;
  scientificName: string | null;
  family: null;
  careProfile: LibraryCareProfile;
}

export function mapPlantfolioEntry(entry: PlantfolioRawEntry): MappedLibraryEntry {
  const careProfile: LibraryCareProfile = {};

  if (entry.lightPreference) careProfile.exposure = LIGHT_LABEL[entry.lightPreference] ?? entry.lightPreference;
  if (entry.humidityPreference) careProfile.humidity = HUMIDITY_LABEL[entry.humidityPreference] ?? entry.humidityPreference;
  if (entry.temperaturePreference) careProfile.temperatureRange = `${entry.temperaturePreference[0]}-${entry.temperaturePreference[1]}°C`;
  if (entry.plantToxicity) careProfile.toxicity = TOXICITY_LABEL[entry.plantToxicity] ?? entry.plantToxicity;

  const substrateParts: string[] = [];
  if (entry.soilPhPreference) substrateParts.push(`pH ${PH_LABEL[entry.soilPhPreference] ?? entry.soilPhPreference}`);
  if (entry.drainagePreference) substrateParts.push(DRAINAGE_LABEL[entry.drainagePreference] ?? entry.drainagePreference);
  if (substrateParts.length) careProfile.substrate = substrateParts.join(", ");

  const interval = averageInterval(entry);
  if (interval) careProfile.watering = { recurrenceType: "FIXED_INTERVAL_DAYS", interval };

  const tipsParts: string[] = [];
  const seasonal = [
    entry.springInterval ? `printemps ${entry.springInterval}j` : null,
    entry.summerInterval ? `été ${entry.summerInterval}j` : null,
    entry.fallInterval ? `automne ${entry.fallInterval}j` : null,
    entry.winterInterval ? `hiver ${entry.winterInterval}j` : null,
  ].filter(Boolean);
  if (seasonal.length) tipsParts.push(`Arrosage indicatif par saison : ${seasonal.join(", ")}.`);
  // `description`/`careTips` sont en anglais (plantfolio n'a pas de version
  // francaise) -- volontairement exclus pour ne pas meler de l'anglais brut
  // a une application en francais. Les infos structurees qu'ils contiennent
  // (rusticite, multiplication, origine...) sont deja extraites ci-dessous.
  const extras: string[] = [];
  if (entry.origin) extras.push(`origine : ${entry.origin}`);
  if (entry.growthRate) extras.push(`croissance ${GROWTH_LABEL[entry.growthRate] ?? entry.growthRate}`);
  if (entry.propagationMethods?.length) {
    extras.push(`multiplication par ${entry.propagationMethods.map((m) => PROPAGATION_LABEL[m] ?? m).join(", ")}`);
  }
  if (entry.hardinessZones) extras.push(`zones de rusticité USDA ${entry.hardinessZones[0]}-${entry.hardinessZones[1]}`);
  if (extras.length) tipsParts.push(extras.join(" · ") + ".");
  if (tipsParts.length) careProfile.tips = tipsParts.join(" ");

  return {
    commonName: entry.typeName,
    scientificName: extractScientificName(entry.commonExamples),
    family: null,
    careProfile,
  };
}
