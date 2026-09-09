# Changelog

Toutes les modifications notables de ce projet sont documentées ici.
Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).

## [Post-MVP] - 2026-09-09

### Ajouté

- Bibliothèque de plantes étendue de 12 à 120 profils : plantes vertes/tropicales courantes, succulentes et cactus, fougères, palmiers, plantes à fleurs, et 17 herbes aromatiques (basilic, persil, ciboulette, thym, romarin, sauge, coriandre, aneth, estragon, laurier, marjolaine, cerfeuil, livèche, sarriette, verveine citronnelle, en plus de la menthe et de l'origan déjà présents).
- Photo de référence par plante de la bibliothèque (`careProfile.imageUrl`) : récupérée automatiquement depuis Wikipédia/Wikimedia Commons (119/120 trouvées), affichée en vignette dans `/bibliotheque` et pré-remplit la photo de la plante à la création si l'utilisateur n'en a pas encore mis une (jamais écrasée si déjà renseignée).
- **Refonte complète de l'UI/UX** : design system (palette vert forêt/sauge/terracotta, typographie Lora + Inter, tokens de radius/ombre/transition), Plant Cards visuelles (grande photo, badge de statut contextuel au lieu d'un badge "En bonne santé" répété partout), navigation réduite à 4 onglets, icônes lucide-react colorées par type de soin (bleu arrosage, vert fertilisation, brun rempotage, orange taille, gris inspection), accueil personnalisé (message contextuel, bande "Ma collection", astuce du jour tournante), fiche plante réorganisée (section "Entretien" renommée depuis "Aujourd'hui" -- elle liste toutes les règles, pas seulement celles du jour), micro-interactions (validation de tâche, apparition des cartes), correctifs mobile (zoom Safari au focus, largeur des champs date/heure).
- **Bibliothèque dynamique (import Perenual)** : recherche et import d'espèces absentes des 120 profils locaux, via [Perenual](https://perenual.com/docs/api). `PlantLibraryEntry` gagne des colonnes de provenance (`source`, `sourceId`, `importedAt`, `lastSyncedAt`, `imageSourceUrl`, `imageLicense`, `imageLicenseUrl`) ; import idempotent (`@@unique([source, sourceId])`), toujours déclenché explicitement par l'utilisateur (jamais automatique), jamais de dépendance réseau pour une fiche déjà importée. `ExternalSpeciesSearch.tsx` intégré au formulaire d'ajout et à `/bibliotheque` comme repli quand la recherche locale ne trouve rien. GBIF/POWO (vérification taxonomique) laissés de côté pour l'instant -- le champ `source` est prêt à les accueillir le jour où ce sera utile.
- **Enrichissement Plantfolio + OpenPlantbook** : import statique unique de 952 profils du dataset [plantfolio-common-plants](https://github.com/Luminoid/plantfolio-common-plants) (CC BY-NC-SA 4.0, sources POWO/ASPCA/USDA) -- 806 réellement ajoutés, 146 doublons avec une fiche locale automatiquement écartés (la fiche locale, mieux soignée, garde la priorité). Bibliothèque locale totale : ~1000 profils. Recherche externe transformée en chaîne de fournisseurs (`src/server/externalSpecies/providers.ts`) : [OpenPlantbook](https://open.plantbook.io) (orienté seuils de soin) essayé en premier, Perenual en repli (quota gratuit plus restreint) ; si la fiche retenue n'a pas de fréquence d'arrosage (typique d'OpenPlantbook, pensé pour un capteur d'humidité plutôt qu'un calendrier), un complément silencieux via Perenual comble ce champ précis. `/bibliotheque` passée en recherche live (comme le formulaire d'ajout) au lieu de charger ~1000 profils d'un coup à l'affichage. Non vérifié en conditions réelles faute de compte OpenPlantbook au moment de l'écriture -- endpoints/authentification confirmés via le code source de la librairie officielle, mapping des champs de réponse à corriger si besoin dès les premiers vrais résultats (comme Perenual en son temps).

### Corrigé

- Passage en revue complet de tous les textes visibles dans l'application (labels, boutons, messages d'erreur, notifications) pour corriger l'absence d'accents français -- affectait la lisibilité de l'interface entière.
- Suppression des mentions aux numéros de section du cahier des charges dans les textes affichés à l'utilisateur (pages Bibliothèque et Engrais) -- ces références restent dans les commentaires de code, utiles au suivi du développement, mais n'ont pas leur place dans l'interface.
- Suppression de la route `/api/sensors` (création de capteur par le corps de la requête), redondante avec `/api/plants/:id/sensors` -- un reliquat de la double session du 2026-09-07, les deux routes faisant la même chose de façon incohérente avec le reste de l'API.
- **Bug du seed de bibliothèque** : les entrées déjà présentes en base (les 12 premières, dont les 7 vraies plantes de l'utilisateur) n'étaient jamais mises à jour lors des redéploiements suivants -- seules les 108 nouvelles entrées de cette session avaient reçu leur photo. `seedLibrary()` fait désormais un vrai upsert (create ou update) à chaque déploiement.
- **Qualité des photos** : 14 entrées avaient récupéré une gravure botanique ancienne (planches "Köhler's Medizinal-Pflanzen", 1887) ou une illustration au lieu d'une vraie photo -- essentiellement des herbes aromatiques (persil, thym, romarin, coriandre, aneth, laurier, cerfeuil, livèche) plus quelques autres (caoutchouc, lierre, rhipsalis, citronnier, olivier). Remplacées par une recherche ciblée dans Wikimedia Commons filtrant les noms de fichiers évoquant une illustration/gravure/carte plutôt qu'une photo. Le bananier d'intérieur (Musa), qui n'avait aucune photo (page Wikipédia ambiguë), en a maintenant une aussi.

## [Post-MVP] - 2026-09-08

### Ajouté

Relecture complète du cahier des charges (45 sections) pour identifier les manques restants après les phases 1-8 ; trois comblés :

- **Gestion des engrais** : page `/engrais` (créer/modifier/supprimer, NPK, dosage recommandé), jusque-là seulement accessible via l'API brute. Nouvelles routes `PATCH`/`DELETE /api/fertilizers/:id`.
- **Page Bibliothèque dédiée** : `/bibliotheque`, navigable depuis la barre de navigation (6e onglet) et Paramètres -- jusque-là la bibliothèque n'était consultable qu'en tapant dans le formulaire d'ajout de plante.
- **Apparence clair/sombre/système** : bouton dans Paramètres (`ThemeToggle`), persiste en `localStorage`, script d'initialisation `beforeInteractive` pour éviter un flash à l'affichage.

### Corrigé

- Suppression d'un fichier de test capteurs dupliqué (`__tests__/sensorTrigger.test.ts`, quasi identique à `careEngine.sensorTrigger.test.ts` -- reliquat de la double session du 09-07).

## [Post-MVP] - 2026-09-07

### Incident

- Un déploiement (build+up de `plantes-app`) a démarré sur une base de données de production vide, effaçant les 7 vraies plantes de l'utilisateur (recréées ensuite via l'API à partir de la bibliothèque). Cause exacte non confirmée (deux sessions Claude travaillaient en parallèle sans coordination sur ce projet ; l'une des deux a été arrêtée par l'utilisateur). Aucune sauvegarde n'existait à ce moment -- voir ci-dessous.

### Ajouté

- Intégration au `backup-manager` du homelab (`www/backup-manager/backend/app/adapters/plantes.py`, même motif que Mystery : bind-mount direct sur `www/plantes/data/`, pas d'API interne à exposer). Sauvegarde/restauration/téléchargement depuis `https://backups.fcold.org`, avec checksum SHA256 et sauvegarde de sécurité automatique avant toute restauration.
- Sauvegarde quotidienne automatique indépendante (cron franky, `/home/franky/.local/bin/backup-plantes`, 4h15, rétention 14 jours, alerte email en cas d'échec) -- même pattern que Mystery.
- 9 tests pytest (`www/backup-manager/backend/tests/test_plantes.py`) : création/liste/suppression, restauration (état exact, fichier inconnu, archive corrompue, checksum invalide), téléchargement.

## [Phase 8] - 2026-09-07

### Ajouté

- Architecture capteurs IoT (section 22) : `POST /api/plants/:id/sensors` (création, session utilisateur), `GET /api/plants/:id/sensors` (liste + dernière lecture). `Sensor.apiKey` (clé unique par capteur, générée automatiquement) pour l'authentification d'un appareil sans session -- un micro-contrôleur ne peut pas porter de cookie NextAuth.
- `POST /api/sensors/:id/readings` : ingestion d'une lecture par l'appareil lui-même (header `X-Sensor-Key`), réponse 404 uniforme que la clé soit fausse ou le capteur inexistant (n'expose jamais l'existence d'un id sans la bonne clé).
- `src/server/careEngine/sensorTrigger.ts` + `evaluateSensorReadingForTasks` (service.ts) : démontre l'évolution demandée section 22, "arroser tous les 7 jours" -> "arroser quand l'humidité passe sous un seuil", sans réécrire le CareEngine existant. Une règle `MOISTURE_THRESHOLD` génère une tâche PENDING immédiate dès qu'une lecture de capteur sol passe sous le seuil configuré (idempotent, pas de doublon si une tâche est déjà en attente).
- 6 tests Vitest sur `shouldTriggerFromMoistureReading`.

### Décisions notables

- Clé d'ingestion par capteur (`apiKey`) plutôt qu'un secret global partagé : révocable individuellement, pas de nouvelle variable d'environnement à gérer au déploiement.
- Pas d'UI de gestion des capteurs (section 22 : "ne pas implémenter complètement cette fonctionnalité dans le MVP") -- l'architecture est prête (modèle, moteur, API), l'interface viendra avec du matériel réel.

## [Phase 7] - 2026-09-07

### Ajouté

- Export complet des données (section 30) : `GET /api/export`, format JSON, références (emplacement/engrais) résolues par nom pour rester portable entre installations.
- Import (section 30) : `POST /api/import`, crée toujours de nouveaux enregistrements (jamais de fusion silencieuse avec une plante existante), rapproche emplacements/engrais par nom, régénère les tâches PENDING via le CareEngine plutôt que d'importer un état de tâche potentiellement périmé.
- UI dans Paramètres : téléchargement direct + import par fichier, avec message de résultat.

### Corrigé (durcissement sécurité, section 39)

- `GET /api/plants/:id/history` et la page Historique acceptaient un paramètre `type` non valide, transmis tel quel à Prisma (cast `as never`) : un type invalide pouvait provoquer une erreur serveur plutôt qu'un filtre ignoré proprement. Validé désormais contre l'enum `CareEventType` réel.
- Audit de toutes les routes API : chaque route vérifie `requireUserId()` et, pour les ressources individuelles, la propriété via `src/server/ownership.ts` avant lecture/écriture -- aucune lacune trouvée au-delà du point ci-dessus.

## [Phase 6] - 2026-09-07

### Ajouté

- Bibliothèque de plantes (section 20) : 12 profils de soin (les 7 plantes réelles de l'utilisateur + 5 des espèces de démo), stockés dans `PlantLibraryEntry.careProfile` (exposition, température, humidité, substrat, toxicité, conseils, et suggestions d'arrosage/fertilisation/rempotage). Seed idempotent par `scientificName`, toujours exécuté indépendamment des données personnelles de l'utilisateur.
- `GET /api/library?q=` : recherche (nom courant ou botanique) pour le flux "Rechercher dans la bibliothèque" du formulaire d'ajout de plante.
- Formulaire d'ajout : recherche intégrée qui pré-remplit nom/nom botanique/substrat/exposition et les trois règles d'entretien -- uniquement les champs encore vides, l'utilisateur garde toujours la main (section 20 : "les valeurs génériques restent des recommandations").

### Corrigé

- `exposure` limité à 80 caractères dans la validation Zod, trop court pour certaines descriptions de la bibliothèque (ex. Pilea) -- porté à 200 comme `substrate`.

## [Phase 5] - 2026-09-07

### Ajouté

- Notifications push (section 18) : `PushSubscription` (un abonnement par appareil/navigateur), `NotificationPreference.lastDigestSentAt`. Couche `NotificationService` (`src/server/notifications/notificationService.ts`) qui construit un **digest quotidien agrégé** (tâches dues aujourd'hui + en retard + aperçu des échéances à venir sous `advanceReminderDays` jours) plutôt qu'une notification par tâche, pour éviter le spam. Envoi effectif via `web-push` (VAPID) avec purge automatique des abonnements périmés (404/410).
- Scheduler en mémoire (`src/server/notifications/scheduler.ts`), démarré au boot du serveur via `src/instrumentation.ts` (hook officiel Next.js) : vérifie toutes les 15 minutes si un utilisateur a atteint son heure de notification, sans dépendre d'un cron côté hôte.
- Page Paramètres : réglages des notifications (activer/désactiver, heure d'envoi, alerte de retard, délai de rappel anticipé), abonnement/désabonnement sur l'appareil courant, bouton d'envoi d'une notification de test.
- PWA installable (section 3) : icônes réelles (`public/icons/`, générées depuis un SVG maison), `manifest.json` complet, service worker minimal (`public/sw.js` : affichage + clic sur la notification, pas de cache offline) enregistré au chargement de l'app.
- 6 nouveaux tests Vitest sur la construction du message de digest (aucune tâche, une, plusieurs, avec retard, avec rappel anticipé, combinaison aujourd'hui+à venir).

### Corrigé

- Une tâche reportée (`SNOOZED`) dont la date de report est déjà passée ne redevenait jamais visible (ni dashboard, ni page Tâches, ni désormais notifications) : nouveau helper partagé `src/server/careEngine/dueTasks.ts` (`isTaskDueNow`), réutilisé aux trois endroits.
- `/sw.js` n'était pas exclu du middleware d'authentification : l'enregistrement du service worker échouait tant qu'on n'était pas connecté (notamment sur `/login`, où `ServiceWorkerRegistration` s'exécute pourtant). Ajouté à la liste d'exclusion, au même titre que `manifest.json`.
- iOS/iPadOS : `PushManager` n'existe que pour une PWA déjà ajoutée à l'écran d'accueil et ouverte depuis cette icône (jamais depuis un onglet Safari, même à jour) -- le message "non supporté" était donc trompeur et bloquant. `NotificationSettings` détecte maintenant ce cas précis et affiche la marche à suivre (Partager -> Sur l'écran d'accueil -> rouvrir depuis l'icône). Ajout de `appleWebApp` aux métadonnées pour un rendu standalone correct sur iOS.

### Décisions notables

- Web Push réel plutôt qu'une simple bannière in-app : c'est ce que demandent les sections 18/45, et le conteneur étant un process Node persistant (pas serverless), un scheduler in-process est suffisant.
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` doit passer en `build.args` Docker, pas seulement en variable d'environnement runtime -- piège classique Next.js/Docker documenté dans le README.

## [Phases 1-4] - 2026-09-07

### Ajouté

- Initialisation du projet (Next.js 15 App Router, TypeScript, Tailwind CSS, Prisma + SQLite, Vitest).
- Modèle de données complet (section 21 du cahier des charges) : `User`, `Location`, `Plant`, `PlantCareRule`, `Task`, `CareEvent`, `Fertilizer`, `Note`, et les tables préparant les phases futures (`PlantLibraryEntry`, `NotificationPreference`, `Sensor`, `SensorReading`).
- CareEngine (`src/server/careEngine/`) : calcul de récurrence (intervalle jours/semaines/mois, annuel, date exacte), règles saisonnières (mois actif/inactif), calcul de dosage d'engrais, génération/transition des tâches (complétée, reportée, en retard). 30 tests Vitest.
- Authentification NextAuth (Auth.js v5, Credentials + sessions JWT), utilisateur unique créé par le seed (pas d'inscription publique).
- API REST complète (section 31) : CRUD plantes, règles d'entretien, arrosage/fertilisation/rempotage/événements génériques, complétion/report de tâches, engrais, notes, emplacements, dashboard, upload de photo.
- Interface : dashboard "Aujourd'hui", liste des plantes (filtres/tri), ajout/modification de plante avec règles d'entretien, fiche plante (état, informations, actions rapides, historique récent, notes), page Tâches (en retard/aujourd'hui/à venir), page Historique (filtrable par type), page Paramètres. Navigation mobile (barre du bas) et desktop (barre latérale).
- Seed de démonstration : 6 plantes (Monstera deliciosa, Calathea orbifolia, Ficus elastica, Sansevieria trifasciata, Echeveria, Pothos) avec règles, historique et tâches dans des états variés.
- Intégration homelab : Dockerfile multi-stage (standalone), `docker-entrypoint.sh` (migrations + seed automatiques), nginx dédié (`nginx-plantes`), ajout au `docker-compose.yml` racine, labels homepage.

### Corrigé

- Middleware NextAuth v5 : l'export brut `auth` comme middleware ne redirige pas automatiquement les utilisateurs non connectés -- ajout d'une redirection explicite vers `/login`, et défense en profondeur côté Server Components (`requireSessionUserId`) pour ne jamais planter si le middleware était un jour contourné.
- `trustHost: true` sur la config NextAuth : nécessaire derrière le reverse proxy nginx-plantes/Cloudflare Tunnel (sinon erreur `UntrustedHost`).
- Runtime Node.js explicite pour le middleware (`export const config = { runtime: "nodejs" }`) : évite d'embarquer bcrypt/Prisma dans un bundle Edge incompatible.
- Image Docker runtime : le CLI Prisma (utilisé par l'entrypoint pour les migrations/seed) a des dépendances transitives non tracées par la sortie "standalone" de Next.js -- `prisma`/`tsx` déplacés en `dependencies` (ils tournent en production) et copie du `node_modules` complet (pruné des devDependencies) plutôt qu'un sous-ensemble cousu main.
- Ajout d'un `.dockerignore` : la sortie standalone de Next.js copie automatiquement les fichiers `.env*` présents au moment du build, ce qui avait fait fuiter le `.env` de dev dans l'image ; désormais exclu du contexte de build.

### Décisions notables

- SQLite plutôt que PostgreSQL (cohérence avec le reste du homelab, aucun nouveau conteneur DB à maintenir).
- Pas de page d'inscription publique : l'app n'est pas derrière Cloudflare Access (contrairement au reste du homelab), donc le login applicatif est le seul rempart contre l'accès public.
- Périmètre limité aux phases 1-4 du cahier des charges : notifications/PWA, bibliothèque de plantes, export/import et capteurs IoT restent à implémenter (tables Prisma déjà prévues).
