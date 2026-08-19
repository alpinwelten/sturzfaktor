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
- **Dynamik-Effekte** nach Leuthäusser Part 3: Seildurchlauf `s`, Schlappseil `δ`,
  Körpersicherung `m₀` – einklappbare Karte, standardmäßig zu; die Summary-Zeile zeigt
  bei **geschlossener** Karte den Zustand (`aus` bzw. die aktiven Werte) und bei offener
  Karte nur den Titel. Beim Laden öffnet sie sich automatisch,
  wenn ein Effekt aktiv ist (`s > 0`, `δ > 0` oder `m₀ > 0`); der Auf/Zu-Zustand selbst
  wird nicht gespeichert. Jeder Effekt wird **einzeln** gegen den Fangstoß oben
  gerechnet – die drei Werte sind nicht kombinierbar
- **Eine Unterkarte je Effekt:** in der aufgeklappten Dynamik-Karte steht jeder Effekt in
  einem eigenen, gerahmten Block mit Kopfzeile (Effektname links, Quellenbeleg rechts);
  Eingabe, Ergebnis-Kasten und Hinweise des Effekts liegen darin. Der Ergebnis-Kasten ist
  farblich abgesetzt (Akzent-Tönung + Akzentrahmen), damit er sich vom Blockhintergrund
  abhebt
- **Von→Zu-Ergebniszeile:** greift ein Effekt, zeigt die Ergebniszeile
  `Basiswert → neuer Wert` (Einheit einmal am Ende) und darunter Richtungspfeil samt
  Prozentänderung – `↓` grün für niedriger, `↑` warnfarben für höher, beides aus den
  vorhandenen Ampel-Tokens. Der Von-Wert ist immer der aktuelle Fangstoß von oben und
  läuft bei jeder Eingabe mit; ohne eingeschalteten Effekt bleibt die Zeile aus. Rechnet
  ein eingeschalteter Effekt, ohne den angezeigten Wert zu verändern, nennt dieselbe
  Zeile den Vergleich in Worten (`unverändert ggü. 4,41 kN`) – ein `4,41 → 4,41`
  entsteht nie
- **Höhenkonstanz beim Reglerziehen (strukturell):** Jeder Text, der sich während eines
  Reglerzugs ändert, ist einzeilig erzwungen – `white-space: nowrap` plus
  `text-overflow: ellipsis`, Trendzeile und Formel-Unterzeilen zusätzlich auf feste
  Zeilenhöhe. Betroffen sind Kopfzeile der Dynamik-Karte, Ergebniszeile (Wert + Badge,
  `flex-wrap: nowrap`), Trendzeile, Formel-Unterzeilen, die Metrik-Unterzeilen oben, die
  Modul-Rückrechnung und die `c`-Notiz (zwei feste Zeilen statt Fließtext). Damit hängt
  keine Höhe mehr an Glyphenbreiten, Systemschrift oder Text-Zoom; reicht der Platz
  nicht, wird gekürzt statt umgebrochen. Zusätzlich wird die Zustandszeile in der
  Kopfzeile bei **offener** Schublade gar nicht mehr fortgeschrieben (sie ist dort
  ausgeblendet) – oberhalb der Regler passiert beim Ziehen also nichts mehr; beim
  Zuklappen wird sie nachgetragen. Die Seitenhöhe ändert sich nur noch, wenn ein Warn-
  oder Optimum-Hinweis erscheint bzw. verschwindet. Hinweistexte dürfen weiter umbrechen,
  enthalten dafür aber keine pro Tick wechselnden Zahlwerte mehr (die Sättigungslänge
  `Optimum ab 0,27 m` steht in der einzeiligen Unterzeile)
- **Testprotokoll mit Excel-Export:** Die letzte Karte hält die aktuelle Rechnung per
  Knopf als fortlaufend nummerierten Eintrag fest (`Test 1`, `Test 2`, …) — Eingaben
  **und** Ergebnisse, mit Zeitstempel. Nummern werden nie neu vergeben (Einzel-Löschen
  lässt den Zähler stehen, damit ältere Exporte eindeutig bleiben); erst „Alle löschen"
  (Zweifach-Tipp, kein Browserdialog) startet wieder bei 1. Der Export erzeugt ein
  echtes `.xlsx` **ohne Fremdbibliothek** (eigener Minimal-Writer, unkomprimiertes
  OPC-ZIP, Inline-Strings): eine Zeile je Test, 28 Spalten mit Einheiten im Kopf,
  Zahlen als echte Zahlzellen (Punktdezimale intern — Excel zeigt sie in deutscher
  Umgebung mit Komma). Auf iOS öffnet der Export das Share-Sheet („In Dateien
  sichern" bzw. direkt in Excel/Numbers öffnen)
- Installierbar & offline (Service Worker)

## Formeln

### Grundrechnung

| Größe | Formel |
|---|---|
| Sturzfaktor | `f = h / L` |
| Fallenergie | `E = m · g · h`  (+ `v₀ = √(2gh)`) |
| Fangstoß | `F = m·g + √( (m·g)² + 2·m·g·M·f )` |
| Seildehnung | `ε = F / M`, `d = ε · L` |
| Kraft Zwischensicherung | `F_U = (1 + c) · F` |
| Kraft auf Sicherer | `F_S = c · F` |
| Modul aus Datenblatt | `M = ((F_UIAA − m·g)² − (m·g)²) / (2·m·g·f_UIAA)` |

Die Fangstoßformel der App ist identisch mit der „familiar impact force formula" des
Papers, `F = m·g + m·√(v₀²ω² + g²)` mit `v₀² = 2gh` und `ω² = M/(L·m)` — als Test
nachgewiesen (`Äquivalenz: …`).

### Dynamik nach Leuthäusser Part 3

| Größe | Formel | Beleg |
|---|---|---|
| Reibungsparameter | `ρ = e^(μ·π)`, **`c = 1/ρ`** | Gl. 1.2 S. 5 · Gl. 2.4 S. 8 |
| Kräfte am Umlenkpunkt | `F_S = F_R/ρ`, `F_U = F_R·(1 + 1/ρ)` | Gl. 2.4, S. 8 |
| Kreisfrequenz | `ω = √(k/m)` mit `k = M/L` | Gl. 6.1, S. 16 |
| Durchlauflänge | `s = u·(t_e − t₀)` | Gl. 6.8, S. 18 |
| Maxima bei festen Zeiten | `F_R^max = Max(F₁, F₂)` | Gl. 6.5–6.7, S. 18 |
| Optimale Steuerung | `t₀(u) = (1/ω)·arcsin( ½·(1 + 2g/(u·ω)) )`, `t_e ≅ π/(2ω)` | Gl. 6.9, S. 20 |
| **Seildurchlauf (verbindlich)** | `s(u) = u·(π/(2ω) − t₀(u))` und `F_R^max(u) ≅ m·g + m·√( (u·√(1 − [½(1 + 2g/(ωu))]²) − v₀)²·ω² + (½·u·ω)² )` | Gl. 6.10, S. 20 |
| Linearisierung (nur Vergleich) | `F_R^max(s) ≅ (m·g + m·√(v₀²ω² + g²))·(1 − (0,87·ω/v₀ − 1,12·g/v₀²)·s)` | Gl. 6.11, S. 20 |
| Schlappseil | **`f_eff = f + (1 − f)·δ/L`** in der Fangstoßformel | Gl. 6.12, S. 20 |
| Körpersicherung | `m_red = m·m₀/(m₀ + m)`, `Ω² = k/m_red`, `F̃_R^HO = m_red·2g + m_red·√( Ω²·(v₀ − u)² + (2g)² )` | S. 21, Fig. 6-5 |

**Konstanten:** `g = 9,81 m/s²` · UIAA-Normsturz `80 kg`, Faktor `1,77`, Grenze `12 kN` ·
Umlenk-Reibung **`c = 0,68` (Default) `= 1/ρ` mit `ρ = 1,46`** (DAV-Messwert, Part 3
Gl. 7.1, S. 24; `1/1,46 = 0,685`, auf die UI-Schrittweite 0,01 gerundet) ·
Modul-Presets `16 / 20 / 24 kN`. `M` = Seilmodul (E·A), Newton intern, kN im UI.

> Richtwerte nach dem Standard-Seilmodell (harmonischer Oszillator) ohne Reibung im
> Sicherungsgerät, Knoten und Körperdämpfung. Reale Stürze liegen meist darunter.

### Umsetzung des Seildurchlaufs

Die App rechnet **verbindlich nach Gl. 6.10**. Weil `s(u)` nicht analytisch invertierbar
ist, wird `u(s)` per Bisektion auf `u ≥ 2g/ω` bestimmt (`s(u)` ist dort streng monoton
wachsend; bei `u = 2g/ω` ist `s = 0`, und Gl. 6.10 liefert genau den Basis-Fangstoß).
Gl. 6.11 dient ausschließlich als interner Konsistenzvergleich für kleine `s` und gilt
nur für `v₀ > 1,12·g/(0,87·ω)`.

Angezeigt wird der beste erreichbare Fangstoß bei **höchstens** `s` Durchlauf, also das
Minimum von Gl. 6.10 über alle `u` mit `s(u) ≤ s` — der Sichernde kann schließlich auch
weniger Seil durchlaufen lassen. In allen realistischen Stürzen ist das exakt der
Gl.-6.10-Wert bei `s`. Nur bei sehr kleinen Sturzfaktoren (kleines `v₀`) hat Gl. 6.10
innerhalb 0–1 m ein Minimum; dann weist die App Sättigung aus, statt eine weitere
Reduktion zu versprechen.

### Grenzen dieser Erweiterung

- **Seildurchlauf ist ein theoretisches Optimum.** Gl. 6.10 unterstellt eine ideal
  gesteuerte Bremse, die genau am Kraftmaximum stoppt. Reale Bremsgeräte lösen erst beim
  Unterschreiten einer Kraftschwelle aus; die Experimente in Fig. 7-9 (S. 27/28) streuen
  stark und bleiben deutlich über der Optimalkurve. Die App gibt deshalb **keine
  Handlungsempfehlung**, Seil durchlaufen zu lassen.
- **Gültig bis `s ≤ 1 m`** (Paper: „excellent for s ≤ 1 m", S. 20). Für `s > 1 m` tritt
  laut S. 22 keine nennenswerte zusätzliche Reduktion mehr ein — die App verspricht dort
  keine und weist darauf hin.
- **Schlappseil:** Näherung für kleine `δ/L`. Für `f < 1` (Halle, Klettergarten)
  **erhöht** Schlappseil den Fangstoß; nur für `f > 1` würde es ihn senken, was in
  Einseillängen-Routen gar nicht vorkommt (S. 21).
- **Körpersicherung:** ungedämpfter harmonischer Oszillator mit `2g`-Termen. Für
  realistische `m₀ = 50–120 kg` liegt `F̃` unter der Fixpunkt-Formel; für sehr große `m₀`
  läuft das Modell gegen `2mg + m·√(v₀²ω² + 4g²)` und damit **über** die Fixpunkt-Formel
  — dort ist der Vergleich nicht mehr aussagekräftig.
- **Keine innere Seilreibung.** Alle drei Effekte benutzen das lineare Modell ohne
  Viskosität. Das vollständige SLS-/ODE-System (Gl. 3.2/4.4) ist bewusst nicht
  implementiert; die App bleibt ein analytischer Rechner. Die Effekte werden einzeln und
  nicht miteinander kombiniert gezeigt.

## Validierung gegen die DAV-Messung

Die DAV-Sicherheitsforschung hat (Part 3, Abschn. 7, Gl. 7.1, S. 24) mit `m = 82 kg`,
`v₀ = 9,185 m/s` (⇒ `h = 4,30 m`), `L = 10,35 m` und `ρ = 1,46` gemessen:
`F_R ≈ 4,4–4,5 kN`, `F_S ≈ 3,0 kN`, `F_U ≈ 7,4–7,5 kN` (Fig. 7-1, S. 24, Kurvenablesung).

Mit dem Preset „mittel" (`M = 20 kN`) und `c = 0,68` rechnet die App `F_R ≈ 4,55 kN`,
`F_S ≈ 3,09 kN`, `F_U ≈ 7,64 kN` — alle drei innerhalb von rund 5 % der Messwerte. Der
Test `DAV-Experiment: …` prüft die Toleranzbänder `F_R ∈ [4,3; 4,8]`,
`F_S ∈ [2,8; 3,3]`, `F_U ∈ [7,1; 8,0] kN`.

## Gespeicherter Zustand (localStorage)

Schlüssel `sturzfaktor.v1`, unverändert. **Migrationspolitik: keine Zwangsmigration.**
Ein Altstand ohne die neuen Felder wird unverändert geladen; fehlende Schlüssel behalten
die Vorgaben aus dem HTML (`s = δ = m₀ = 0`), und ein vom Nutzer selbst gesetztes `c`
bleibt erhalten — auch wenn es der alten Voreinstellung entspricht. Nur Werksvorgabe und
„Zurücksetzen" liefern `c = 0,68`. Neue Stände tragen zusätzlich `schema: 2`, damit eine
spätere Migration bewusst entschieden werden kann.

Geschrieben wird **entkoppelt vom Ziehen**: Rechnen und Anzeige laufen bei jedem
Eingabe-Tick live, der Schreibvorgang selbst ist um 200 ms nachlaufend gebündelt
(Trailing-Debounce). Abschließend geschrieben wird bei `change` (Zieh-Ende, Feld
verlassen), bei „Zurücksetzen" sofort und beim Verlassen der App
(`visibilitychange` → hidden, `pagehide`) — ein Wechsel mitten im Debounce-Fenster
verliert also nichts.

**Zweiter Schlüssel `sturzfaktor.tests.v1`** (Testprotokoll, `schema: 1`): hält den
Zähler `nextNr` und die Liste `tests[]` — je Test `nr`, `name`, `zeit` (Epoch-ms) sowie
`eingaben` und `ergebnisse` als **rohe, ungerundete** Zahlen (formatiert wird nur bei
Anzeige und Export; die Ergebnisse werden mitgespeichert, damit alte Protokolle auch
nach späteren Engine-Änderungen dokumentieren, was damals gerechnet wurde). Geschrieben
wird direkt beim Tap — hier ist kein Reglerzug beteiligt, ein Debounce ist unnötig.
Schlägt das Schreiben fehl (Speicher voll), wird der Eintrag zurückgerollt und die App
meldet es in der Hinweiszeile; der Live-Zustand unter `sturzfaktor.v1` bleibt davon
unberührt. Kaputte oder schema-fremde Bestände werden beim Laden verworfen (frischer
Bestand), ein zu kleiner Zähler wird defensiv auf `max(nr) + 1` angehoben.

## Quellen

- U. Leuthäusser: *Physics of climbing ropes – part 3: viscous and dry friction combined,
  rope control and experiments*, English Version 1, 2. Juli 2012, www.SigmaDeWe.com,
  © Leuthäusser Systemanalysen (29 Seiten). Alle Gleichungs- und Seitenangaben oben
  beziehen sich auf dieses Papier.
- EN 892 / UIAA 101 für Normsturz-Masse, Normsturz-Sturzfaktor und Fangstoßgrenze.

## Struktur

```
index.html · styles.css · app.js        UI (build-free, Vanilla)
js/engine.mjs                            reine Physik (DOM-frei, testbar)
js/protokoll.mjs                         Testprotokoll: Spalten, Zähler, Storage-Form (DOM-frei)
js/xlsx.mjs                              Minimal-XLSX-Writer, dependency-frei (DOM-frei)
test/engine.test.mjs                     node:test
test/protokoll.test.mjs · test/xlsx.test.mjs   node:test
manifest.webmanifest · sw.js             PWA (installierbar, offline)
icons/icon.svg + tools/generate-icons.mjs  Icons via Headless-Chrome
tools/make-qr.py                         QR-Code (qrcode + PIL)
```

## Entwicklung

```bash
npm test                 # Tests: Engine + Testprotokoll + XLSX-Writer (node --test)
npm run icons            # PNG-Icons aus icons/icon.svg erzeugen
npm run qr               # QR-Codes erzeugen
python3 -m http.server   # lokal testen -> http://localhost:8000
```

## Deploy

GitHub Pages (Branch `main`, Root). Push genügt – die Seite aktualisiert sich automatisch.
