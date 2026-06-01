# Sturzfaktor & Fangstoß-Rechner — Design / Spec

**Datum:** 2026-06-01
**Ziel:** Professionelle, schlichte PWA, die sofort Sturzfaktor, Fallenergie und Fangstoß
(Impact Force) berechnet — analog zum Bergfreunde-Rechner, aber präziser und mit Profi-Extras.
**Ablage:** Repo `alpinwelten/sturzfaktor` → live auf `alpinwelten.github.io/sturzfaktor`,
vollständige Kopie im Drive-Ordner `04_Alpine Sicherheit & Ausbildung/Sturzfaktor`.

## Physik / Formeln (SI-Basis in der Engine, kN/J im UI)

| Größe | Formel | Hinweis |
|---|---|---|
| Sturzfaktor | `f = h / L` | h = freie Fallstrecke, L = ausgegebenes Seil |
| Fallenergie | `E = m·g·h` | Joule; zusätzlich `v = √(2gh)` |
| Fangstoß (Kletterer) | `F = m·g + √( (m·g)² + 2·m·g·M·f )` | kanonische Kletterseil-Formel; M = Seilmodul (E·A) in N |
| Seildehnung | `ε = F/M` (relativ), `d = ε·L` (absolut) | typ. dynamischer Peak 28–40 % |
| Kraft oberste Zwischensicherung | `(1+c)·F` | c = Umlenk-Reibungsfaktor, Default 0,66 → 1,66·F |
| Kraft auf Sicherer | `c·F` | Default 0,66·F |
| Seilmodul aus Datenblatt | `M = ((F_UIAA − m·g)² − (m·g)²) / (2·m·g·f_UIAA)` | UIAA-Normsturz m=80 kg, f=1,77 |

**Konstanten:** `g = 9,81 m/s²`, `UIAA_MASS = 80 kg`, `UIAA_FACTOR = 1,77` (EN 892 / UIAA 101),
`UIAA_LIMIT = 12 kN` (max. Fangstoß Einfachseil), `c_default = 0,66`.
**Modul-Presets:** weich 16 · mittel 20 · steif 24 kN.

## Komponenten

- **`js/engine.mjs`** — reine, DOM-freie Rechen-Logik. Einzelfunktionen (`sturzfaktor`,
  `fallenergie`, `aufprallGeschwindigkeit`, `fangstoss`, `seildehnungRel/Abs`, `ankerkraft`,
  `sichererkraft`, `modulAusUIAA`, `bewertung`) + Aggregat `computeSturz(input)`. Robust:
  `nn` (≥0), `pos` (>0 mit Default), NaN-sicher, keine Infinity-Vergiftung.
- **`test/engine.test.mjs`** — `node:test`, Referenzwerte (UIAA 80/1,77 → ≈8,28 kN),
  Round-Trip Modul↔UIAA, Edge-Cases (L≤0, h=0, negativ, f>2, NaN, riesige Werte).
- **`index.html`** — Eingaben (m, h, L, M mit Presets, ausklappbar Datenblatt-UIAA + advanced c),
  Ergebnis-Karten, Ampel. Mobile-first.
- **`styles.css`** — Designsystem „Schiefer/Anthrazit + Signal-Ampel".
- **`app.js`** — UI-Wiring, Live-Recalc bei jeder Eingabe, Preset-Buttons, Datenblatt-Rückrechnung,
  Number-Felder mit Steppern, Persistenz (localStorage), PWA-Install + SW-Register.
- **`manifest.webmanifest`, `sw.js`** — installierbar, offline (App-Shell cache-first / Inhalt network-first).
- **`icons/`** — `icon.svg` + generierte PNGs (1024/512/192/180/167/152/120/32 + maskable-512), via
  `tools/generate-icons.mjs` (Headless-Chrome).
- **`qr-sturzfaktor.png` + `…-beschriftet.png`** — QR auf die Live-URL (Python qrcode+PIL).

## UX-Prinzipien

- **Sofort:** keine „Berechnen"-Taste — Live-Recalc bei jedem `input`.
- **Range 0 → sehr hoch:** freie Zahlenfelder, keine harten Obergrenzen; nur ≥0/​>0-Validierung.
- **Schnell ablesbar:** Fangstoß groß + Ampel (gering/deutlich/hoch/kritisch ggü. UIAA 12 kN).
- **Schlicht & professionell:** ruhiges Schiefer-Layout, ein Akzent, klare Typo-Hierarchie.

## Ampel (Fangstoß auf Kletterer)

| kN | Stufe | Farbe |
|---|---|---|
| ≤ 4 | gering | grün |
| 4–8 | deutlich | gelb |
| 8–12 | hoch | orange |
| > 12 | kritisch (> UIAA-Grenze) | rot |

## Edge Cases

- `L ≤ 0` → Sturzfaktor/Fangstoß „—" + Hinweis „Seil > 0 nötig"; Energie bleibt rechenbar.
- `h = 0` → f=0; Formel liefert F = 2·m·g (Modell-Grenzfall „plötzliche Last", bewusst formeltreu).
- negative Eingaben → 0; sehr große Werte → saubere de-DE-Formatierung (J→kJ→MJ, kN mit Dezimal).
- `f > 2` erlaubt + Badge „Klettersteig-/Extrembereich".

## Verifikation

Build solo (kohärente Hand), danach adversariale Verifikations-Workflow-Phase:
Physik-Herleitung gegen Referenzpunkte, Edge-Cases, Code-Review (engine+app), UX/PWA/A11y.
`node --test` muss grün sein, bevor deployed wird.
