# Génération de l'APK Android (TWA)

Jungly est une PWA (`plantes.fcold.org`). L'app Android est une **Trusted Web
Activity** (TWA) : une coquille native qui ouvre soit l'offre hébergée
(`jungly-app.fcold.org`) soit une instance auto-hébergée choisie par
l'utilisateur, en plein écran sans barre d'adresse. Le squelette est généré
avec [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) (l'outil
officiel de Google), puis étendu avec du code natif (voir "Ce qui est écrit
à la main" plus bas).

Ce document décrit comment (re)builder l'app, et surtout **où vit la clé de
signature** et comment ne plus jamais la perdre (voir l'incident du
2026-09-10 ci-dessous).

## Pourquoi ce document existe

Un premier APK avait été généré le 2026-09-10, mais le mot de passe du
keystore utilisé n'avait été noté nulle part. Résultat : keystore
irrécupérable. Sur le Play Store, **la clé de signature d'une app est fixée à
vie dès la première publication** — la perdre revient à ne plus jamais
pouvoir publier de mise à jour sous cette fiche. Un nouveau keystore a donc dû
être généré avant toute publication réelle. Ce document + la procédure
ci-dessous existent pour que ça ne se reproduise pas.

Deuxième incident (2026-09-16) : le tout premier projet Android généré par
Bubblewrap n'avait jamais été committé (dossier `output/` éphémère), ni
l'outillage (image Docker `bw-build` reconstruite à la main à chaque
session, régulièrement purgée par le cron de nettoyage hebdomadaire — voir
`docker_cleanup_incident_2026_09`). Tout redécouvrir à chaque fois n'était
plus tenable une fois du vrai code natif ajouté (wizard, Play Billing).
Le projet Android vit donc maintenant **dans ce dépôt** (`android/`), et
l'outillage dans un **conteneur permanent** (`android-dev`, voir plus bas).

## Où vit le keystore (ne JAMAIS le committer dans ce dépôt, public)

```
/mnt/data/plantes/android-signing/jungly-release.keystore   (600, propriétaire uniquement)
/mnt/data/plantes/android-signing/keystore-password.txt     (copie de secours locale)
```

Ce dossier est :
- **hors du dépôt git** (public) — aucun risque de fuite via GitHub.
- **hors de la sauvegarde automatique** `backup-plantes` (qui ne couvre que
  `~/serveur/www/plantes/data`).

**La copie de référence du mot de passe doit être dans le gestionnaire de
mots de passe personnel de l'utilisateur.** Le fichier `keystore-password.txt`
n'est qu'un filet de sécurité local — ne pas compter dessus comme unique
copie. Le mot de passe (storepass = keypass) est sur sa propre ligne dans ce
fichier, entourée de texte explicatif — ne pas supposer que c'est la
première ligne.

Alias de la clé : `jungly`.

## Outillage : conteneur Docker permanent, jamais reconstruit à la main

Le JDK et l'Android SDK (plusieurs centaines de Mo) vivent dans le volume
Docker nommé `bubblewrap-cache`, et le conteneur qui les utilise
(`android-dev`, service de `docker-compose.yml` à la racine du serveur)
tourne **en permanence** (`restart: unless-stopped`), au même titre que les
autres services de la stack. Il n'y a donc plus rien à reconstruire d'une
session à l'autre :

```bash
# Depuis /home/franky/serveur (une seule fois, ou apres modif de Dockerfile.android-dev)
docker compose up -d --build android-dev
```

Le projet Android (`./www/plantes/android`) est monté dans `/workspace` --
toutes les commandes ci-dessous passent par `docker exec android-dev`. Le
keystore est monté en lecture seule sur `/keystore`.

## Procédure

### Premier lancement (déjà fait, gardé pour référence)

`twa-manifest.json` (committé dans `android/`) contient toute la
configuration TWA. `bubblewrap init` s'étant révélé peu fiable en
automatisation non interactive (boucles de reprompt sur les questions de
certificat X.500), ce fichier a été écrit à la main puis le projet généré
avec :

```bash
docker exec android-dev bubblewrap update --skipVersionUpgrade \
  --manifest /workspace/twa-manifest.json --directory /workspace
```

Le keystore lui-même a été généré une fois avec `keytool` (jamais via un
assistant interactif) :

```bash
docker exec android-dev sh -c '
  PASS=$(sed -n "5p" /keystore/keystore-password.txt)
  keytool -genkeypair -v -keystore /keystore/jungly-release.keystore \
    -alias jungly -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$PASS" -keypass "$PASS" \
    -dname "CN=Jungly App, OU=Homelab, O=Jungly, L=Liege, ST=Liege, C=BE"
'
```

(Le mot de passe est lu depuis le fichier monté, jamais passé en argument
`-e`/CLI en clair côté hôte, pour ne pas apparaître dans `ps aux` ou
`docker inspect`.)

### Compiler et signer l'app (à chaque changement)

```bash
docker exec android-dev sh -c '
  PASS=$(sed -n "5p" /keystore/keystore-password.txt)
  export BUBBLEWRAP_KEYSTORE_PASSWORD="$PASS"
  export BUBBLEWRAP_KEY_PASSWORD="$PASS"
  echo "n" | bubblewrap build --directory /workspace --manifest /workspace/twa-manifest.json
'
```

Le `echo "n"` répond au prompt "There are changes in twa-manifest.json,
apply them?" qui apparaît dès que le manifeste diffère du checksum
enregistré (`manifest-checksum.txt`) -- répondre "n" (non) évite que
Bubblewrap **régénère et écrase** les fichiers modifiés à la main
(`AndroidManifest.xml`, `LauncherActivity.java`, voir plus bas). Ne
répondre "Y" que si aucune personnalisation manuelle n'est en jeu.

Produit `app-release-signed.apk` (à installer directement, sideload) et
`app-release-bundle.aab` (à téléverser sur Play Console) dans
`android/` -- tous deux ignorés par git (`android/.gitignore`), à
régénérer à chaque fois plutôt qu'à committer.

**Important** : après tout `bubblewrap update`/`build`, le conteneur tourne
en root et écrit les fichiers du workspace en root -- toujours suivre d'un
`docker exec android-dev chown -R 1000:1000 /workspace` avant d'éditer les
fichiers depuis l'hôte.

### Mettre à jour `assetlinks.json` (uniquement si le keystore change)

Sans ça, Android affiche la TWA avec la barre d'adresse du navigateur au lieu
du plein écran natif (vérification de Digital Asset Links échouée). Le
fichier (`public/.well-known/assetlinks.json`) est identique pour toute
instance -- self-hébergée ou non -- puisqu'il ne dépend que du package et de
l'empreinte de l'app officielle, jamais du domaine visité :

```bash
docker exec android-dev sh -c '
  PASS=$(sed -n "5p" /keystore/keystore-password.txt)
  keytool -list -v -keystore /keystore/jungly-release.keystore -alias jungly -storepass "$PASS" | grep SHA256
'
```

## Ce qui est écrit à la main (au-delà du squelette Bubblewrap)

Le squelette généré (Application/DelegationService/LauncherActivity.java,
AndroidManifest.xml, build.gradle) charge une URL **fixe** définie dans
`twa-manifest.json`. Pour permettre le choix entre auto-hébergement et
offre hébergée payante (voir CHANGELOG), plusieurs fichiers étendent ce
squelette :

- **`InstancePrefs.java`** : persiste l'URL cible choisie (SharedPreferences).
- **`SetupActivity.java`** : assistant de premier lancement -- choix
  auto-hébergé (saisie d'URL) ou offre hébergée (achat Google Play).
- **`BillingHelper.java`** : intégration Play Billing Library (achat
  unique, non consommable) -- pas d'acquittement côté client, c'est
  `POST /api/billing/verify-purchase` (backend Next.js) qui vérifie et
  acquitte le jeton auprès de l'API Play Developer.
- **`ApiClient.java`** : petit client HTTP (POST JSON) pour cet appel,
  sans dépendance externe.
- **`LauncherActivity.java`** (modifié) : redirige vers `SetupActivity` tant
  qu'aucune URL n'est configurée ; `getLaunchingUrl()` retourne l'URL
  choisie plutôt que celle, fixe, du manifeste.

`AppConfig.java` centralise les constantes (URL/productId de l'offre
hébergée) -- à garder synchronisées avec
`src/server/billingProducts.ts` côté backend.

**Non testé sur appareil réel ni via Play Console** (compte développeur pas
encore actif au moment de l'écriture) -- seule la compilation a été
vérifiée (`bubblewrap build` réussi, APK/AAB générés). Un vrai test d'achat
nécessite l'app présente dans Play Console (au moins en Internal Testing).

## Prochaine mise à jour de l'app

Reprendre `twa-manifest.json` existant (ne pas en réécrire un nouveau),
incrémenter `appVersionCode`/`appVersionName`, relancer uniquement l'étape
"Compiler et signer" (le keystore ne change jamais).
