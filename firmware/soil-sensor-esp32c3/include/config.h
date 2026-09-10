#pragma once

// ---------------------------------------------------------------------------
// Broches -- choisies pour eviter GPIO2/8/9 (broches de strapping sur
// l'ESP32-C3 : leur niveau au boot selectionne le mode de demarrage).
// ---------------------------------------------------------------------------
constexpr int PIN_SOIL_SENSOR_POWER = 10; // sortie numerique -- HIGH seulement pendant la lecture
constexpr int PIN_SOIL_SENSOR_ADC   = 0;  // ADC1_CH0 -- sortie analogique de la sonde d'humidite
constexpr int PIN_CHARGE_DETECT     = 1;  // ADC1_CH1 -- pont diviseur sur le "+" (entree de charge) du power board
constexpr int PIN_BATTERY_ADC       = 4;  // ADC1_CH4 -- pont diviseur sur B+ (tension batterie)

// ---------------------------------------------------------------------------
// Cycle de reveil
// ---------------------------------------------------------------------------
constexpr uint64_t SLEEP_INTERVAL_US = 30ULL * 60 * 1000000; // 30 minutes
constexpr int ADC_OVERSAMPLE_COUNT = 16;   // moyenne de N lectures (l'ADC de l'ESP32 est bruite)
constexpr uint32_t SENSOR_WARMUP_MS = 50;  // stabilisation apres mise sous tension de la sonde

// ---------------------------------------------------------------------------
// Detection de charge -- a confirmer/ajuster avec un multimetre (voir
// README.md de ce dossier) avant le premier deploiement reel.
// ---------------------------------------------------------------------------
constexpr float CHARGE_DETECT_THRESHOLD_V = 1.5f; // tension GPIO (post-diviseur) au-dessus de laquelle on considere "en charge"

// Ponts diviseurs (ne JAMAIS relier une tension >3.3V directement a une
// GPIO ESP32 -- non tolerantes 5V).
// "+ " (~5V charge) -> GPIO : 100k (haut, vers "+") + 150k (bas, vers GND) => ~3.0V a pleine charge
constexpr float CHARGE_DIVIDER_RATIO = (100.0f + 150.0f) / 150.0f;
// B+ (~3.0-4.2V LiPo) -> GPIO : a adapter selon le pont reellement installe ; 100k+100k => facteur 2 (marge large)
constexpr float BATTERY_DIVIDER_RATIO = 2.0f;

// ---------------------------------------------------------------------------
// Calibration batterie (LiPo 1S -- approximation lineaire, suffisante pour
// une simple alerte "batterie faible", pas pour une jauge precise)
// ---------------------------------------------------------------------------
constexpr float BATTERY_EMPTY_V = 3.3f;
constexpr float BATTERY_FULL_V  = 4.2f;

// ---------------------------------------------------------------------------
// Reseau / API
// ---------------------------------------------------------------------------
constexpr int WIFI_CONNECT_TIMEOUT_MS = 15000;
constexpr int HTTP_TIMEOUT_MS = 10000;
constexpr int MAX_POST_ATTEMPTS = 3;
constexpr const char* SENSOR_UNIT = "%"; // unite envoyee pour une lecture SOIL_MOISTURE
