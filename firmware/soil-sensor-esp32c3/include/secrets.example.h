#pragma once

// Copier ce fichier en secrets.h (gitignore, jamais commite) et renseigner
// les vraies valeurs.

constexpr const char* WIFI_SSID = "TonReseauWiFi";
constexpr const char* WIFI_PASSWORD = "motdepasse";

constexpr const char* API_HOST = "plantes.fcold.org";

// Crees depuis l'appli Jungly (page d'une plante -> Capteurs -> Ajouter un
// capteur) : l'id est visible en permanence, la cle API en clair
// uniquement a la creation (ou a une rotation) -- note-la immediatement.
constexpr const char* SENSOR_ID = "REMPLACE_MOI";
constexpr const char* SENSOR_API_KEY = "REMPLACE_MOI";
