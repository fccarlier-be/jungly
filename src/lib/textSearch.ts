/**
 * Retour utilisateur (2026-09-19) : "il n'y a pas d'orchidées dans la
 * bibliotheque" -- en fait si (Phalaenopsis, Dendrobium, Vanda...), mais
 * chercher "orchidee" (sans accent, faute de frappe courante en francais)
 * ne remontait rien : le `contains` SQLite est insensible a la casse ASCII
 * mais pas aux accents (e != é). Normalise les deux cotes de la comparaison
 * plutot que d'ajouter une colonne/migration -- la bibliotheque ne depasse
 * pas quelques milliers de lignes, un filtrage en memoire reste instantane.
 */
export function normalizeForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}
