# Firmware capteur d'humidité (ESP32-C3 Super Mini)

Firmware PlatformIO pour un capteur d'humidité du sol autonome sur batterie,
qui pousse ses lectures vers l'API sensor de Jungly.

**Non compilé/testé sur matériel réel** (pas d'ESP32 dans cet environnement) --
attends-toi à devoir corriger d'éventuelles erreurs de compilation ou
d'ajuster les valeurs de calibration au premier flash.

## Matériel attendu

- ESP32-C3 Super Mini
- Sonde "Capacitive Soil Moisture Sensor v2.0" (sortie analogique)
- Module chargeur/boost USB-C 5V, broches `+`/`-` (entrée de charge), `OUT+`/`OUT-` (sortie 5V), `B+`/`B-` (batterie)
- Batterie LiPo 1S

## Câblage

| Signal | Broche ESP32-C3 | Détail |
|---|---|---|
| Alimentation sonde (VCC) | GPIO10 (sortie) | HIGH seulement pendant la lecture, jamais en continu |
| Sortie analogique sonde (AOUT) | GPIO0 (ADC1_CH0) | |
| Détection de charge | GPIO1 (ADC1_CH1) | Via pont diviseur depuis `+` du power board -- **voir vérification ci-dessous avant de câbler** |
| Tension batterie | GPIO4 (ADC1_CH4) | Via pont diviseur depuis `B+` du power board |
| Alimentation ESP32 | `OUT+`/`OUT-` du power board | |

**Ponts diviseurs** (aucune tension >3.3V ne doit jamais toucher une GPIO directement, l'ESP32-C3 n'est pas tolérant 5V) :
- `+` (~5V en charge) → 100kΩ vers la GPIO, puis 150kΩ vers la masse → ~3.0V max côté GPIO
- `B+` (~3.0-4.2V) → adapter le pont pour rester sous 3.3V avec une marge confortable (100kΩ+100kΩ, ratio 2, convient large)

**Avant de souder quoi que ce soit sur `+`/`-`** : vérifier au multimètre que cette paire affiche bien ~0V batterie seule / ~5V avec USB-C branché (voir discussion de conception -- certains modules génériques dupliquent en fait la tension batterie sur ces pads, auquel cas la détection de charge ne fonctionnera pas et il faudra taper directement sur le VBUS du connecteur USB-C, ou se rabattre sur un interrupteur reed manuel).

## Configuration

```bash
cp include/secrets.example.h include/secrets.h
```

Renseigner dans `secrets.h` : SSID/mot de passe WiFi, et l'id + la clé API du
capteur (créés depuis l'appli Jungly : page d'une plante → Capteurs →
Ajouter un capteur -- la clé API n'est affichée qu'une seule fois, à noter
immédiatement).

## Calibration

Le firmware convertit une valeur ADC brute en pourcentage via 2 points
(sec/humide) stockés en NVS, avec des valeurs par défaut approximatives à
ne pas utiliser telles quelles. Pour calibrer :

1. Flasher, connecter en USB, ouvrir un moniteur série à 115200 bauds
2. Appuyer sur reset (déclenche la fenêtre de calibration de 5s, jamais
   activée sur un réveil deep-sleep normal)
3. Sonde à l'air libre (sèche) → taper `DRY` + Entrée
4. Sonde plongée dans un verre d'eau → taper `WET` + Entrée
5. Chaque commande reçue prolonge la fenêtre de 5s -- possible de refaire
   plusieurs mesures avant de laisser expirer

## Build / flash

```bash
pio run -t upload
pio device monitor
```

## Ce qui n'est volontairement pas géré ici

- **OTA** : un appareil en deep sleep n'écoute pas entre deux réveils --
  mise à jour uniquement par USB-C.
- **Watchdog matériel** : l'API `esp_task_wdt` a changé entre versions du
  core Arduino-ESP32 (signature différente selon la version résolue par
  PlatformIO) -- à ajouter une fois la version du core figée, plutôt que de
  deviner la bonne signature ici.
