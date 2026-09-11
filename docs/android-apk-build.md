# Génération de l'APK Android (TWA)

Jungly est une PWA (`plantes.fcold.org`). L'APK Android est une **Trusted Web
Activity** (TWA) : une coquille native minimale qui ouvre la PWA en plein
écran, sans barre d'adresse, générée avec [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap)
(l'outil officiel de Google pour ça).

Ce document décrit comment (re)générer cet APK, et surtout **où vit la clé de
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
copie.

Alias de la clé : `jungly`. Mot de passe du keystore et de la clé identiques
(un seul secret à retenir).

## Outillage : tout tourne dans Docker, rien n'est installé sur l'hôte

Le JDK 17 et l'Android SDK cmdline-tools pèsent plusieurs centaines de Mo et
n'ont aucune raison de polluer le système du homelab (partagé avec tous les
autres services). Ils sont téléchargés une seule fois dans un **volume Docker
nommé** et réutilisés à chaque build :

```bash
docker volume create bubblewrap-cache   # /root/.bubblewrap dans les conteneurs
```

Image de travail (Node 20 + `expect` + `@bubblewrap/cli`), à builder une
fois :

```dockerfile
FROM node:20-bookworm
RUN apt-get update && apt-get install -y expect && rm -rf /var/lib/apt/lists/*
RUN npm install -g @bubblewrap/cli
```

```bash
docker build -t bw-build -f Dockerfile.bwbuild .
```

## Procédure complète

### 1. Écrire `twa-manifest.json` à la main

L'assistant interactif `bubblewrap init` s'est révélé peu fiable en
automatisation non interactive (boucles de reprompt sur les questions de
certificat X.500). Au lieu de lutter avec ça, on écrit directement le fichier
de configuration — le schéma est stable et documenté par le code source de
`@bubblewrap/core` (`TwaManifest`) :

```json
{
  "packageId": "org.fcold.plantes.twa",
  "host": "plantes.fcold.org",
  "name": "Jungly",
  "launcherName": "Jungly",
  "display": "standalone",
  "themeColor": "#B3684A",
  "backgroundColor": "#F7F4EE",
  "enableNotifications": true,
  "startUrl": "/",
  "iconUrl": "https://plantes.fcold.org/icons/icon-512.png",
  "maskableIconUrl": "https://plantes.fcold.org/icons/icon-512.png",
  "signingKey": { "path": "/output/android.keystore", "alias": "jungly" },
  "appVersionName": "1",
  "appVersionCode": 1,
  "webManifestUrl": "https://plantes.fcold.org/manifest.json",
  "fallbackType": "customtabs",
  "minSdkVersion": 21,
  "orientation": "default"
}
```

(Les autres champs — couleurs de navigation, `shortcuts`, `features`, etc. —
prennent les valeurs par défaut de `TwaManifest` ; voir un fichier généré pour
la liste complète.)

### 2. Générer le keystore avec `keytool` (jamais via l'assistant interactif)

`keytool` est un outil CLI standard, entièrement scriptable — contrairement à
l'assistant de bubblewrap, aucun risque de boucle de reprompt :

```bash
docker run --rm \
  -v bubblewrap-cache:/root/.bubblewrap \
  -v "$(pwd)/output:/output" \
  bw-build bash -c '
    /root/.bubblewrap/jdk/jdk-17.0.11+9/bin/keytool -genkeypair -v \
      -keystore /output/android.keystore \
      -alias jungly \
      -keyalg RSA -keysize 2048 -validity 10000 \
      -storepass "MOT_DE_PASSE" -keypass "MOT_DE_PASSE" \
      -dname "CN=Jungly App, OU=Homelab, O=Jungly, L=Liege, ST=Liege, C=BE"
  '
```

(Le vrai mot de passe est passé via un fichier monté en lecture seule dans le
conteneur, jamais en argument `-e`/CLI en clair, pour ne pas apparaître dans
`ps aux` ou `docker inspect`.)

### 3. Générer le projet Android depuis le manifeste

`bubblewrap update --skipVersionUpgrade` régénère tout le squelette du projet
Android à partir d'un `twa-manifest.json` existant, **sans aucune question
interactive** (contrairement à `init`) :

```bash
docker run --rm \
  -v bubblewrap-cache:/root/.bubblewrap \
  -v "$(pwd)/output:/output" \
  bw-build \
  bubblewrap update --skipVersionUpgrade \
    --manifest /output/twa-manifest.json --directory /output
```

### 4. Accepter les licences du SDK (une fois, non interactif)

```bash
docker run --rm -v bubblewrap-cache:/root/.bubblewrap bw-build bash -c '
  export JAVA_HOME=/root/.bubblewrap/jdk/jdk-17.0.11+9
  yes | /root/.bubblewrap/android_sdk/tools/bin/sdkmanager --licenses \
    --sdk_root=/root/.bubblewrap/android_sdk
'
```

`sdkmanager --licenses` est une simple boucle y/N sur stdin (pas un assistant
avec rendu terminal complexe) : `yes |` fonctionne de façon fiable, sans les
pièges rencontrés avec `bubblewrap init`.

### 5. Compiler et signer l'APK

Les mots de passe sont passés par variables d'environnement — `bubblewrap
build` les lit automatiquement sans prompt s'il les trouve :

```bash
docker run --rm \
  -v bubblewrap-cache:/root/.bubblewrap \
  -v "$(pwd)/output:/output" \
  -e BUBBLEWRAP_KEYSTORE_PASSWORD="MOT_DE_PASSE" \
  -e BUBBLEWRAP_KEY_PASSWORD="MOT_DE_PASSE" \
  -w /output \
  bw-build \
  bubblewrap build --directory /output --manifest /output/twa-manifest.json
```

Produit `app-release-signed.apk` (à installer directement) et
`app-release-bundle.aab` (pour le Play Store).

### 6. Mettre à jour `assetlinks.json`

Sans ça, Android affiche la TWA avec la barre d'adresse du navigateur au lieu
du plein écran natif (vérification d'Digital Asset Links échouée).

Récupérer l'empreinte SHA-256 du nouveau certificat :

```bash
keytool -list -v -keystore android.keystore -alias jungly -storepass "MOT_DE_PASSE" | grep SHA256
```

La reporter dans `public/.well-known/assetlinks.json` (`sha256_cert_fingerprints`),
puis builder/déployer l'app comme d'habitude.

## Prochaine mise à jour de l'app

Pour une prochaine version : reprendre `twa-manifest.json` existant (ne pas
en réécrire un nouveau), incrémenter `appVersionCode`/`appVersionName`,
relancer uniquement les étapes 3 et 5 (le keystore ne change jamais).
