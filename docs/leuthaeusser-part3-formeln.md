# Ground Truth — Leuthäusser, Physics of climbing ropes Part 3 (2012)

Quelle: Ulrich Leuthäusser, „Physics of climbing ropes – part 3: viscous and dry
friction combined, rope control and experiments", English Version 1 (2. Juli 2012),
www.SigmaDeWe.com, © Leuthäusser Systemanalysen. 29 Seiten.
PDF: Google Drive, Ordner „01_KI & Technologie/Sturzfaktor" (privat).

Alle Seitenangaben = PDF-Seitenzahl (identisch mit gedruckter Seitenzahl).
Notation: m = Sturzmasse [kg], g = 9,81 m/s², v0 = Geschwindigkeit bei
Seilstraffung [m/s], f = Sturzfaktor, L = wirksame Seillänge [m],
q = Seilquerschnitt [m²], ω² = k/m mit Federkonstante k [N/m].

## 1. Materialmodell SLS (S. 3–5)

- 3-Parameter-Modell (Standard Linear Solid): zwei E-Moduln E1, E2 + Viskosität η.
  Längenabhängige Konstanten: k1 = (q/L)·E1, k2 = (q/L)·E2 (Gl. 1.1, S. 4).
- Statischer E-Modul: E = E1·E2/(E1+E2). Mit statischer Dehnung ε_s = 7,5 % bei
  80 kg und 10-mm-Seil: E = mg/(ε_s·q) = 1,3·10⁸ N/m² = **0,13 GPa** (S. 5).
- E2 ≈ F_max/(ε_d·q) ≈ 2fmg/(ε_d²·q) ≈ **0,38 GPa** mit f = 1,77, dynamische
  Dehnung ε_d ≈ 4·ε_s (S. 5).
- Viskosität η ≈ 0,3 s · E2 ≈ **0,1 GPa·s**; Dämpfungsgrad ≈ 0,2 (S. 5).
- Merksatz S. 5: Fangstoß-Maximum ≈ 10× statische Gewichtskraft, obwohl ε_d nur
  ≈ 4× ε_s — „the slower you pull, the larger the elongation".

## 2. Externe Reibung am Umlenkpunkt (S. 5–8)

- Euler-Eytelwein: F(α) = F0·exp(−μα) (Gl. 2.1, S. 6);
  Summe der Reibungskräfte R(α) = F0·(1 − exp(−μα)) (Gl. 2.2, S. 7).
- Reibungsparameter **ρ = e^(μπ)** für Umschlingungswinkel α = π (Gl. 1.2, S. 5).
  Experimente (Abschnitt 7): **ρ = 1,46** (μ ≈ 0,12).
- Kräftebilanz am Umlenkpunkt, Bewegung in Sturzrichtung, gültig für die Maxima
  (Gl. 2.4, S. 8):
  - **F_S = F_R / ρ**   (Kraft auf Sichernden)
  - **F_U = F_R · (1 + 1/ρ)**   (Kraft auf Umlenkpunkt/Anker)
  - R = F_S − F_R = −F_R·(ρ−1)/ρ   (Reibkraft, Gl. 2.3/2.4)
- Grenzfälle (S. 8): ρ = 1 (reibungsfrei) → F_U = 2·F_R; ρ ≫ 1 → F_U = F_R, F_S = 0.
- Nach Umkehr der Bewegungsrichtung gilt stattdessen R = F_R·(ρ−1), d. h.
  F_R/F_S wechselt von ρ auf 1/ρ (Gl. 2.5, S. 8; experimentell bestätigt S. 25,
  Fig. 7-3).

### Bezug zur App (Herleitung, nicht Paper-Text)

Die App rechnet F_anker = (1+c)·F und F_sicherer = c·F. Das ist exakt Gl. (2.4)
mit **c = 1/ρ**. DAV-Messwert ρ = 1,46 ⇒ c = 1/1,46 = **0,685 ≈ 0,68**.
(App-Default bisher 0,66 ⇒ ρ = 1,52.)

## 3. Maximalkräfte, elastischer Grenzfall η → ∞ (S. 14)

Mit effektiver Federkonstante k_eff = ρ·k21·k22/(ρ·k21 + k22):

- **F_R^max = mg + m·√(v0²·k_eff/m + g²)**
- F_S^max = F_R^max/ρ,  F_U^max = F_R^max + F_S^max

### Äquivalenz zur bekannten Fangstoßformel (Herleitung, nicht Paper-Text)

m·√(v0²·k/m + g²) = √(m·v0²·k + (mg)²). Mit v0² = 2gh, k = M/L, f = h/L
(M = Seilmodul E·q in N) folgt m·v0²·k = 2mg·M·f, also
**F = mg + √((mg)² + 2mg·M·f)** — identisch mit der Formel der App und der
„familiar impact force formula" des Papers (S. 20/21: F = mg + m√(v0²ω² + g²)).

## 4. Seildurchlauf / dynamisches Sichern (Abschnitt 6.1, S. 16–20)

Modell ohne innere Reibung: ÿ + ω²(y − y0) = g (Gl. 6.1) mit
ω = √(k/m); Seilschlupf y0 läuft ab t0 mit konstanter Geschwindigkeit u bis te.
**Durchlauflänge s = u·(te − t0)** (Gl. 6.8, S. 18).

- Maximum Variante 1 (Maximum vor te, S. 18):
  **F1 = mg + m·√((v0 − u·cos(ωt0))²·ω² + (g − u·ω·sin(ωt0))²)**
- Maximum Variante 2 (Maximum nach te, S. 18):
  F2 = mg + m·√((v0 − u·cos(ωt0) + u·cos(ωte))²·ω² + (g − uω·sin(ωt0) + uω·sin(ωte))²)
- **F_R^max = Max(F1, F2)** (Gl. 6.7).
- Optimale Steuerung (S. 20): te ≅ π/(2ω) und
  **t0(u) = (1/ω)·arcsin(½·(1 + 2g/(uω)))** (Gl. 6.9).
  (arcsin-Argument ≤ 1 ⇒ u ≥ 2g/ω; bei u = 2g/ω ist s = 0.)
- Parametrische Optimallösung (Gl. 6.10, S. 20), „excellent for s ≤ 1 m":
  - s(u) = u·(π/(2ω) − t0(u))
  - **F_R^max(u) ≅ mg + m·√((u·√(1 − [½(1 + 2g/(ωu))]²) − v0)²·ω² + (½·u·ω)²)**
- Linearisierung für kleine s (Gl. 6.11, S. 20):
  **F_R^max(s) ≅ (mg + m·√(v0²ω² + g²)) · (1 − (0,87·ω/v0 − 1,12·g/v0²)·s)**
- Referenzwerte Fig. 6-2 (S. 17): ω = 6,25 s⁻¹, v0 = 9,185 m/s, u = 3 m/s,
  t0 = 0,075 s, te = 0,3 s ⇒ s = 67,5 cm; Reduktion des Maximums von ≈ 5,5 kN
  auf ≈ 4,05 kN (Kurvenablesung, nur qualitativ).
- Optimale Durchlaufgeschwindigkeit u ≈ 2/3·v0 für große s (S. 18).
- Mit innerer+äußerer Reibung (Abschnitt 6.2, S. 22): für **s > 1 m keine
  signifikante zusätzliche Reduktion** mehr; reale Bremsgeräte stoppen nicht am
  Kraftmaximum und sind daher suboptimal (S. 22, S. 29).

## 5. Schlappseil (S. 20–21)

Schlappseil δ erhöht die Sturzhöhe: v0 = √(2g(h+δ)); zugleich k = E·q/(L+δ).
Für kleine δ/L (Gl. 6.12, S. 20):

**F_R^max(0) ≈ mg + √(2mg·E·q·(f + (1−f)·δ/L) + (mg)²)**

d. h. effektiver Sturzfaktor **f_eff = f + (1−f)·δ/L** in der bekannten Formel
(E·q = Seilmodul M der App).

- Folgerung S. 21: Für f > 1 würde Schlappseil den Fangstoß (überraschend)
  senken — aber f > 1 ist in Einseillängen-Routen nicht möglich. Für f < 1
  (Halle, Klettergarten) ERHÖHT Schlappseil den Fangstoß ⇒ dort vermeiden.

## 6. Körpersicherung (Sichern am Körper/Gurt, S. 21, Fig. 6-5)

Sichernder (Masse m0) wird beim Sturz hochgezogen, kann mit Geschwindigkeit u
hochspringen. Näherung ungedämpfter harmonischer Oszillator (ohne Herleitung
angegeben):

**F̃_R^HO = m_red·2g + m_red·√(Ω²·(v0 − u)² + (2g)²)**
mit **m_red = m·m0/(m0 + m)** und **Ω² = k/m_red**

Vergleichsformel (fixer Sicherungspunkt): F_R^HO = mg + m·√(v0²·ω² + g²).
m_red < m senkt den Fangstoß; u senkt die wirksame Anfangsgeschwindigkeit.

Herleitung, nicht Paper-Text: Für m0 → ∞ geht m_red → m und Ω → ω, also
lim(m0→∞) F̃ = 2mg + m·√(v0²ω² + 4g²) — das liegt wegen der 2g-Terme des
Modells ÜBER der Fixpunkt-Formel (bei DAV-Parametern ≈ +23 %); F̃ < F gilt
nur für hinreichend kleine m0 (bei DAV-Parametern bis m0 ≈ 232 kg), im
realistischen Sicherer-Bereich m0 = 50–120 kg aber immer.

## 7. Energiedissipation (S. 15, 18, 23)

- Extern (trockene Reibung) dissipierter Anteil ≈ 1/3 der Gesamtenergie bei den
  Parametern aus Abschnitt 7 (S. 15, Fig. 5-1).
- Vom Sicherungsgerät absorbierte Energie: ∫ m·u·ω²·(y − y0) dt (Gl. 6.6, S. 18).
- Mit Seildurchlauf s = 51 cm teilen sich Sicherungsgerät, innere und äußere
  Reibung die Energie zu etwa gleichen Teilen (S. 23, Fig. 6-8).

## 8. DAV-Validierungsexperiment (Abschnitt 7, S. 24–25)

Messungen der DAV-Sicherheitsforschung (Gl. 7.1, S. 24):

| Größe | Wert |
|---|---|
| Sturzmasse m | 82 kg |
| v0 bei Seilstraffung | 9,185 m/s |
| Seillänge vor Umlenkpunkt L1 | 6,95 m |
| Seillänge nach Umlenkpunkt L2 | 3,4 m |
| Gesamtlänge L | 10,35 m |
| Externe Reibung ρ | 1,46 |
| k2 | 3,2·10³ N/m |
| k1 | 1,8·10³ N/m |
| η/L | 0,8·10³ N·s/m |
| entsprechend | E2 = 0,42 GPa, E1 = 0,24 GPa, η = 0,1 GPa·s |

Messwerte bei vernachlässigbarem Seildurchlauf s ≈ 0 (Fig. 7-1, S. 24,
Kurvenablesung): **F_U ≈ 7,4–7,5 kN, F_R ≈ 4,4–4,5 kN, F_S ≈ 3,0 kN**.

Verhältnis F_R/F_S = ρ vor dem Vorzeichenwechsel der Geschwindigkeit, danach
1/ρ (S. 25, Fig. 7-3) — bestätigt das Coulomb-Reibmodell (S. 26).

Fig. 7-9 (S. 27–28): 27 Experimente, gemessene Fangstoß-Reduktion durch
Seildurchlauf streut stark und bleibt deutlich über der theoretisch optimalen
Kurve.

### App-Nachrechnung (Herleitung, nicht Paper-Text)

Äquivalente Sturzhöhe h = v0²/(2g) = 4,30 m ⇒ f = 4,30/10,35 = 0,416.
Mit App-Formel, M = 20 kN (Preset „mittel"), c = 1/1,46 = 0,685:
F = 804 N + √(804² + 2·804·20000·0,416) N ≈ **4,55 kN**;
F_S = 0,685·4,55 ≈ **3,12 kN**; F_U = 1,685·4,55 ≈ **7,67 kN**.
Alle drei innerhalb ≈ 5 % der DAV-Messwerte — das simple App-Modell mit
Preset „mittel" ist experimentell plausibel (Toleranzband für Tests: F_R
4,3–4,8 kN, F_S 2,8–3,3 kN, F_U 7,1–8,0 kN).

## 9. Schlussfolgerungen des Papers (S. 28–29)

- Lineares viskoelastisches SLS-Modell beschreibt ein Kletterseil sehr gut;
  für kurze Zeiten genügen 2 Parameter (ein E-Modul + Viskosität).
- Externe Reibung macht das Modell nichtlinear; beide Reibungsarten sind für
  typische Stürze (nicht zu hohe Sturzfaktoren) wesentlich.
- Reiner harmonischer Oszillator ohne Reibung reicht NICHT, um die gemessenen
  Kräfte zu erklären (F_S ≠ F_R nur durch externe Reibung erklärbar).
- Innere Reibung absorbiert Sturzenergie, verhindert Nachschwingen und senkt
  F_R substanziell.
- Optimale Seildurchlauf-Steuerung stoppt früh nahe dem Kraftmaximum; reale
  Bremsgeräte tun das nicht ⇒ nur suboptimale Reduktion.
