# Sturzfaktor & Fangstoß

Schlichte, hochprofessionelle PWA, die **Sturzfaktor**, **Fallenergie** und **Fangstoß**
(Impact Force) für Kletterseile **sofort** berechnet – inklusive Seildehnung sowie Kraft auf
oberste Zwischensicherung und Sicherer.

**Live:** https://alpinwelten.github.io/sturzfaktor/

## Funktionen

- **Live-Berechnung** bei jeder Eingabe (kein „Berechnen"-Knopf)
- Eingaben mit Steppern + Slidern, freie Range `0 → sehr hoch`
- **Signal-Ampel** für den Fangstoß (gering · deutlich · hoch · kritisch ggü. UIAA 12 kN)
- **Seilmodul** per Preset (weich/mittel/steif) oder frei – plus optionale Rückrechnung
  aus dem **UIAA-Fangstoß** des Seil-Datenblatts
- Installierbar & offline (Service Worker)

## Formeln

| Größe | Formel |
|---|---|
| Sturzfaktor | `f = h / L` |
| Fallenergie | `E = m · g · h`  (+ `v = √(2gh)`) |
| Fangstoß | `F = m·g + √( (m·g)² + 2·m·g·M·f )` |
| Seildehnung | `ε = F / M`, `d = ε · L` |
| Kraft Zwischensicherung | `(1 + c) · F` |
| Kraft auf Sicherer | `c · F` |
| Modul aus Datenblatt | `M = ((F_UIAA − m·g)² − (m·g)²) / (2·m·g·f_UIAA)` |

**Konstanten:** `g = 9,81 m/s²` · UIAA-Normsturz `80 kg`, Faktor `1,77`, Grenze `12 kN` ·
Umlenk-Reibung `c = 0,66` (Default) · Modul-Presets `16 / 20 / 24 kN`.
`M` = Seilmodul (E·A), Newton intern, kN im UI.

> Richtwerte nach dem Standard-Seilmodell (harmonischer Oszillator) ohne Reibung im
> Sicherungsgerät, Knoten und Körperdämpfung. Reale Stürze liegen meist darunter.

## Struktur

```
index.html · styles.css · app.js        UI (build-free, Vanilla)
js/engine.mjs                            reine Physik (DOM-frei, testbar)
test/engine.test.mjs                     node:test
manifest.webmanifest · sw.js             PWA (installierbar, offline)
icons/icon.svg + tools/generate-icons.mjs  Icons via Headless-Chrome
tools/make-qr.py                         QR-Code (qrcode + PIL)
```

## Entwicklung

```bash
npm test                 # Engine-Tests (node --test)
npm run icons            # PNG-Icons aus icons/icon.svg erzeugen
npm run qr               # QR-Codes erzeugen
python3 -m http.server   # lokal testen -> http://localhost:8000
```

## Deploy

GitHub Pages (Branch `main`, Root). Push genügt – die Seite aktualisiert sich automatisch.
