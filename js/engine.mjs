// engine.mjs — reine Sturzfaktor-/Fangstoß-Physik (kein DOM, testbar).
// Modell: kanonische Kletterseil-Fangstoßformel (harmonischer Oszillator):
//   F = m·g + √( (m·g)² + 2·m·g·M·f )
// mit m = Systemmasse, g = 9,81 m/s², M = Seilmodul (E·A) in Newton, f = Sturzfaktor.
// Intern wird in SI gerechnet (N, m, kg, J); das UI liefert kN/m und bekommt kN/J/% zurück.
//
// Quelle der Dynamik-Erweiterung (Seildurchlauf, Schlappseil, Körpersicherung,
// Reibungsparameter ρ): U. Leuthäusser, „Physics of climbing ropes – part 3:
// viscous and dry friction combined, rope control and experiments", English
// Version 1, 2. Juli 2012, www.SigmaDeWe.com. Gleichungs-/Seitenbelege stehen
// an jeder Funktion.

export const G = 9.81;            // m/s² Erdbeschleunigung
export const UIAA_MASS = 80;      // kg  Normsturz-Masse (EN 892 / UIAA 101, Einfachseil)
export const UIAA_FACTOR = 1.77;  // –   Normsturz-Sturzfaktor nach EN 892 / UIAA 101
export const UIAA_LIMIT_KN = 12;  // kN  max. zulässiger Fangstoß Einfachseil (EN 892)

// Gültigkeitsgrenze der Seildurchlauf-Näherung: Gl. 6.10 ist laut Paper
// „excellent for s ≤ 1 m" (S. 20); ab s > 1 m tritt keine nennenswerte zusätzliche
// Reduktion mehr ein (S. 22). Darüber wird deshalb nicht weiter extrapoliert.
export const SEILDURCHLAUF_MAX_M = 1;

// Externe Reibung am Umlenkpunkt: ρ = e^(μ·π) für Umschlingungswinkel α = π
// (Leuthäusser Part 3, Gl. 1.2, S. 5). Von der DAV-Sicherheitsforschung gemessen:
// ρ = 1,46 (μ ≈ 0,12) — Part 3, Abschn. 7, Gl. 7.1, S. 24.
export const RHO_DAV = 1.46;

// Seilmodul-Presets (kN) nach Seil-Steifigkeit; mittel ≈ modernes Einfachseil.
export const MODUL_PRESETS = { weich: 16, mittel: 20, steif: 24 };

// c = 1/ρ (siehe cAusRho): 1/1,46 = 0,6849… → auf die UI-Schrittweite 0,01
// gerundet 0,68. Die frühere Voreinstellung entsprach ρ ≈ 1,52 (siehe Git-Verlauf);
// die Umstellung auf 0,68 macht die App quellenkonsistent zum DAV-Messwert.
export const DEFAULTS = { m: 80, h: 4, L: 10, M: 20, c: 0.68, uiaa: 8.5, s: 0, delta: 0, m0: 0 };

// Ampel-Schwellen für den Fangstoß auf den Kletterer (kN). Orientiert an der
// UIAA-Seilgrenze (12 kN) und Körperbelastungs-Richtwerten.
export const AMPEL = [
  { max: 4,        stufe: 'gering',   klasse: 'gut'  },
  { max: 8,        stufe: 'deutlich', klasse: 'warn' },
  { max: 12,       stufe: 'hoch',     klasse: 'hoch' },
  { max: Infinity, stufe: 'kritisch', klasse: 'krit' },
];

// ---- Robuste Eingabe-Helfer -------------------------------------------------
// nn: nicht-negativ (NaN/negativ -> 0); pos: positiv mit Default-Fallback.
const nn  = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
const pos = (v, d) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };
const clamp01 = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0; };
const clamp = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo; };

// ---- Einzelformeln (SI) -----------------------------------------------------

// Sturzfaktor f = h / L. L ≤ 0 -> null (undefiniert, vom UI abgefangen).
export function sturzfaktor(h, L) {
  const hh = nn(h);
  const LL = Number(L);
  if (!Number.isFinite(LL) || LL <= 0) return null;
  return hh / LL;
}

// Fallenergie E = m·g·h (Joule).
export function fallenergie(m, h) {
  return nn(m) * G * nn(h);
}

// Aufprallgeschwindigkeit am Seileinhang v = √(2·g·h) (m/s).
export function aufprallGeschwindigkeit(h) {
  return Math.sqrt(2 * G * nn(h));
}

// Fangstoß F = m·g + √( (m·g)² + 2·m·g·M·f ) in Newton.
// m in kg, M in Newton, f dimensionslos (≥0). f=null -> null.
export function fangstoss(m, M_N, f) {
  if (f == null || !Number.isFinite(f)) return null;
  const mg = nn(m) * G;
  const MM = nn(M_N);
  const ff = Math.max(0, f);
  if (mg <= 0) return 0;
  return mg + Math.sqrt(mg * mg + 2 * mg * MM * ff);
}

// Relative Seildehnung beim Peak ε = F/M (dimensionslos, z. B. 0,30 = 30 %).
export function seildehnungRel(F_N, M_N) {
  const MM = nn(M_N);
  if (F_N == null || MM <= 0) return null;
  return F_N / MM;
}

// Absolute Seildehnung d = ε·L (m).
export function seildehnungAbs(eps, L) {
  if (eps == null) return null;
  return eps * nn(L);
}

// Kraft auf die oberste Zwischensicherung (Umlenkung wirkt wie Flaschenzug):
// F_anker = (1+c)·F, mit c = Reibungs-/Wirkungsgrad-Faktor der Umlenkung.
// Identisch mit der Kräftebilanz am Umlenkpunkt F_U = F_R·(1 + 1/ρ)
// (Leuthäusser Part 3, Gl. 2.4, S. 8), wenn c = 1/ρ gesetzt wird.
export function ankerkraft(F_N, c) {
  if (F_N == null) return null;
  return (1 + clamp01(c)) * F_N;
}

// Kraft auf den Sicherer (Seilbremse): F_sicherer = c·F.
// Identisch mit F_S = F_R/ρ (Leuthäusser Part 3, Gl. 2.4, S. 8) für c = 1/ρ.
export function sichererkraft(F_N, c) {
  if (F_N == null) return null;
  return clamp01(c) * F_N;
}

// Seilmodul M aus dem im Datenblatt angegebenen UIAA-Fangstoß zurückrechnen.
// Auflösen der Fangstoßformel nach M beim Normsturz (m=80 kg, f=1,77):
//   M = ((F_UIAA − m·g)² − (m·g)²) / (2·m·g·f_UIAA)
// Eingabe F_UIAA in Newton, Ausgabe M in Newton. Unphysikalische Eingaben -> null.
export function modulAusUIAA(Fuiaa_N, mass = UIAA_MASS, fUiaa = UIAA_FACTOR) {
  const F = Number(Fuiaa_N);
  const mg = nn(mass) * G;
  if (!Number.isFinite(F) || F <= mg || mg <= 0 || fUiaa <= 0) return null;
  const M = ((F - mg) ** 2 - mg * mg) / (2 * mg * fUiaa);
  return M > 0 ? M : null;
}

// Ampel-Bewertung des Fangstoßes (Eingabe in kN).
export function bewertung(F_kN) {
  if (F_kN == null || !Number.isFinite(F_kN)) return null;
  return AMPEL.find((a) => F_kN <= a.max) ?? AMPEL[AMPEL.length - 1];
}

// ============================================================================
// PART 3 — Reibungsmodell, Seildurchlauf, Schlappseil, Körpersicherung
// Leuthäusser, „Physics of climbing ropes – part 3" (2012), www.SigmaDeWe.com
// ============================================================================

// ---- Reibungsmodell: c ↔ ρ --------------------------------------------------
// Die App rechnet mit c, das Paper mit ρ = e^(μ·π) (Gl. 1.2, S. 5).
// Gl. 2.4 (S. 8): F_S = F_R/ρ und F_U = F_R·(1 + 1/ρ) ⇒ c = 1/ρ.
// ρ ≥ 1, weil Reibung die Kraft auf der Sicherer-Seite nur mindern kann
// (ρ = 1 reibungsfrei ⇒ F_U = 2·F_R, ρ ≫ 1 ⇒ F_U = F_R, F_S = 0; S. 8).
export function cAusRho(rho) {
  const r = Number(rho);
  if (!Number.isFinite(r) || r < 1) return null;
  return 1 / r;
}
export function rhoAusC(c) {
  const cc = Number(c);
  if (!Number.isFinite(cc) || cc <= 0 || cc > 1) return null;
  return 1 / cc;
}

// ---- Grundgrößen des Oszillatormodells --------------------------------------

// Seil-Federkonstante k = M/L [N/m] (M = E·q = Seilmodul in N; Gl. 1.1, S. 4).
export function federkonstante(M_N, L) {
  const MM = nn(M_N);
  const LL = Number(L);
  if (MM <= 0 || !Number.isFinite(LL) || LL <= 0) return null;
  return MM / LL;
}

// Kreisfrequenz ω = √(k/m) (S. 16, Gl. 6.1). Ungültige Eingaben -> null.
export function omega(m, M_N, L) {
  const k = federkonstante(M_N, L);
  const mm = nn(m);
  if (k == null || mm <= 0) return null;
  return Math.sqrt(k / mm);
}

// ---- Seildurchlauf / dynamisches Sichern (Abschn. 6.1, S. 16–20) ------------

// Durchlauflänge s = u·(t_e − t_0) (Gl. 6.8, S. 18).
export function durchlaufLaenge(u, t0, te) {
  const uu = nn(u);
  const a = Number(t0), b = Number(te);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, uu * (b - a));
}

// Kleinstmögliche Durchlaufgeschwindigkeit der Optimalsteuerung: u ≥ 2g/ω.
// Folgt aus Gl. 6.9 (arcsin-Argument ≤ 1); bei u = 2g/ω ist s = 0.
export function uMin(om) {
  const w = Number(om);
  if (!Number.isFinite(w) || w <= 0) return null;
  return 2 * G / w;
}

// Optimaler Startzeitpunkt t_0(u) = (1/ω)·arcsin( ½·(1 + 2g/(u·ω)) ) (Gl. 6.9, S. 20).
// Für u < 2g/ω ist das Argument > 1; es wird intern auf 1 geklemmt
// (⇒ t_0 = t_e = π/(2ω), also s = 0), damit nie NaN entsteht.
export function t0Optimal(u, om) {
  const w = Number(om), uu = Number(u);
  if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(uu) || uu <= 0) return null;
  const arg = clamp(0.5 * (1 + 2 * G / (uu * w)), -1, 1);
  return Math.asin(arg) / w;
}

// Parametrische Optimallösung, s-Zweig (Gl. 6.10, S. 20):
//   s(u) = u·( π/(2ω) − t_0(u) )   mit t_e ≅ π/(2ω).
export function durchlaufSVonU(u, om) {
  const w = Number(om);
  const t0 = t0Optimal(u, om);
  if (t0 == null) return null;
  return Math.max(0, Number(u) * (Math.PI / (2 * w) - t0));
}

// Parametrische Optimallösung, Kraft-Zweig (Gl. 6.10, S. 20):
//   F_R^max(u) ≅ mg + m·√( ( u·√(1 − [½(1 + 2g/(ωu))]²) − v0 )²·ω² + (½·u·ω)² )
// Bei u = 2g/ω wird der Wurzelterm 0 und ½uω = g, also exakt der
// Basis-Fangstoß mg + m·√(v0²ω² + g²). Für u < 2g/ω existiert die
// Optimalsteuerung nicht; u wird dann auf 2g/ω geklemmt (= kein Durchlauf).
export function fangstossVonU(m, om, v0, u) {
  const mm = nn(m), w = Number(om), vv = nn(v0);
  let uu = Number(u);
  if (mm <= 0 || !Number.isFinite(w) || w <= 0 || !Number.isFinite(uu) || uu <= 0) return null;
  uu = Math.max(uu, 2 * G / w);
  const arg = clamp(0.5 * (1 + 2 * G / (w * uu)), -1, 1);
  const cosT0 = Math.sqrt(Math.max(0, 1 - arg * arg));
  const a = uu * cosT0 - vv;
  const F = mm * G + mm * Math.sqrt(a * a * w * w + (0.5 * uu * w) ** 2);
  return Number.isFinite(F) ? Math.max(mm * G, F) : null;
}

// Maximaler Fangstoß bei frei gewählten Steuerzeiten (Gl. 6.5–6.7, S. 18):
//   F1 = mg + m·√( (v0 − u·cos(ωt0))²·ω² + (g − uω·sin(ωt0))² )      (Max vor t_e)
//   F2 = mg + m·√( (v0 − u·cos(ωt0) + u·cos(ωte))²·ω²
//                 + (g − uω·sin(ωt0) + uω·sin(ωte))² )               (Max nach t_e)
//   F_R^max = Max(F1, F2)
// Nicht die Optimalsteuerung — dient dem Nachvollzug einzelner Läufe (z. B. Fig. 6-2).
export function fangstossMaxZeiten(m, om, v0, u, t0, te) {
  const mm = nn(m), w = Number(om), vv = nn(v0), uu = nn(u);
  const a = Number(t0), b = Number(te);
  if (mm <= 0 || !Number.isFinite(w) || w <= 0 || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  const c0 = Math.cos(w * a), s0 = Math.sin(w * a);
  const ce = Math.cos(w * b), se = Math.sin(w * b);
  const F1 = mm * G + mm * Math.sqrt((vv - uu * c0) ** 2 * w * w + (G - uu * w * s0) ** 2);
  const F2 = mm * G + mm * Math.sqrt(
    (vv - uu * c0 + uu * ce) ** 2 * w * w + (G - uu * w * s0 + uu * w * se) ** 2);
  const F = Math.max(F1, F2);
  return Number.isFinite(F) ? F : null;
}

// Linearisierung für kleine s (Gl. 6.11, S. 20):
//   F_R^max(s) ≅ (mg + m·√(v0²ω² + g²)) · (1 − (0,87·ω/v0 − 1,12·g/v0²)·s)
// NUR Konsistenzvergleich für kleine s — für die App-Rechnung gilt Gl. 6.10.
export function fangstossLinearS(m, om, v0, s) {
  const mm = nn(m), w = Number(om), vv = nn(v0), ss = nn(s);
  if (mm <= 0 || !Number.isFinite(w) || w <= 0 || vv <= 0) return null;
  const F0 = mm * G + mm * Math.sqrt(vv * vv * w * w + G * G);
  const F = F0 * (1 - (0.87 * w / vv - 1.12 * G / (vv * vv)) * ss);
  return Number.isFinite(F) ? F : null;
}

// Gültigkeitsbedingung der Linearisierung: nur für v0 > 1,12·g/(0,87·ω) ist der
// Klammerterm in Gl. 6.11 überhaupt fallend (sonst sagt die Näherung eine
// Kraft-ERHÖHUNG durch Seildurchlauf voraus).
export function linearGueltig(om, v0) {
  const w = Number(om), vv = nn(v0);
  if (!Number.isFinite(w) || w <= 0 || vv <= 0) return false;
  return vv > 1.12 * G / (0.87 * w);
}

// Inversion s → u der parametrischen Lösung (Gl. 6.10) per Bisektion.
// s(u) ist auf u ≥ 2g/ω streng monoton wachsend mit s(2g/ω) = 0 und s → ∞,
// deshalb ist die Bisektion garantiert konvergent. Die obere Schranke wird
// verdoppelnd gesucht und bei uCap gedeckelt (Schutz vor Endlosschleifen).
export function uAusS(s, om, { tol = 1e-12, maxIter = 200, uCap = 1e9 } = {}) {
  const w = Number(om);
  const u0 = uMin(om);
  if (u0 == null) return null;
  const ss = nn(s);
  if (ss <= 0) return u0;

  let lo = u0, hi = u0 * 2;
  let guard = 0;
  while (durchlaufSVonU(hi, w) < ss && hi < uCap && guard++ < 200) hi *= 2;
  if (durchlaufSVonU(hi, w) < ss) return hi;   // s außerhalb des Rechenbereichs -> Deckel

  for (let i = 0; i < maxIter; i++) {
    const mid = 0.5 * (lo + hi);
    if (mid <= lo || mid >= hi) return mid;          // Gleitkomma-Auflösung erreicht
    const sm = durchlaufSVonU(mid, w);
    if (Math.abs(sm - ss) <= tol) return mid;
    if (sm < ss) lo = mid; else hi = mid;
  }
  return 0.5 * (lo + hi);
}

// Bestmöglicher Fangstoß bei HÖCHSTENS s Seildurchlauf.
//
// Gl. 6.10 liefert F_R^max(u) für genau die Durchlauflänge s(u). Da der
// Sichernde die Durchlauflänge wählt, ist bei einer Obergrenze s der beste
// erreichbare Wert das Minimum über alle u mit s(u) ≤ s. Für alle realistischen
// Stürze (v0 > 1,12·g/(0,87·ω), Gl. 6.11) fällt F_R^max über den ganzen Bereich
// und Minimum = Gl.-6.10-Wert bei s. Nur bei sehr kleinen v0 (Mini-Sturzfaktoren)
// hat Gl. 6.10 innerhalb 0…1 m ein Minimum; darüber hinaus bringt mehr Durchlauf
// keine Reduktion mehr — das wird als Sättigung ausgewiesen statt weggerechnet.
//
// Rückgabe (SI): { F0N Basis-Fangstoß, FN bester Wert ≤ s, F610N roher Gl.-6.10-Wert
// bei s, u zugehörige Durchlaufgeschwindigkeit, sMin Durchlauflänge des Minimums,
// gesaettigt, ueberGueltigkeit (s > 1 m, Paper S. 22) }.
export function seildurchlaufOptimum(m, M_N, L, h, s) {
  const w = omega(m, M_N, L);
  if (w == null) return null;
  const mm = nn(m);
  const v0 = aufprallGeschwindigkeit(h);
  const u0 = uMin(w);
  const F0 = fangstossVonU(mm, w, v0, u0);
  const ss = nn(s);

  if (ss <= 0) {
    return { F0N: F0, FN: F0, F610N: F0, u: u0, sMin: 0, gesaettigt: false, ueberGueltigkeit: false };
  }

  const uS = uAusS(ss, w);
  const F610 = fangstossVonU(mm, w, v0, uS);

  // Minimum über [u0, uS]: grobes Raster + ternäre Verfeinerung im besten Intervall.
  const N = 256;
  let bi = 0, bF = F0;
  for (let i = 1; i <= N; i++) {
    const u = u0 + (uS - u0) * (i / N);
    const F = fangstossVonU(mm, w, v0, u);
    if (F != null && F < bF) { bF = F; bi = i; }
  }
  let lo = u0 + (uS - u0) * (Math.max(0, bi - 1) / N);
  let hi = u0 + (uS - u0) * (Math.min(N, bi + 1) / N);
  for (let i = 0; i < 80 && hi - lo > 1e-12; i++) {
    const a = lo + (hi - lo) / 3, b = hi - (hi - lo) / 3;
    if (fangstossVonU(mm, w, v0, a) <= fangstossVonU(mm, w, v0, b)) hi = b; else lo = a;
  }
  const uOpt = 0.5 * (lo + hi);
  const FOpt = fangstossVonU(mm, w, v0, uOpt);
  const FN = Math.min(bF, FOpt != null ? FOpt : bF, F610);
  const uBest = FN === F610 ? uS : uOpt;
  const sMin = Math.min(ss, durchlaufSVonU(uBest, w) ?? ss);

  return {
    F0N: F0,
    FN: Math.max(mm * G, FN),
    F610N: F610,
    u: uBest,
    sMin,
    gesaettigt: sMin < ss - 1e-6,
    ueberGueltigkeit: ss > 1,
  };
}

// ---- Schlappseil (Gl. 6.12, S. 20/21) ---------------------------------------

// Effektiver Sturzfaktor f_eff = f + (1 − f)·δ/L.
// Näherung für kleine δ/L: Schlappseil erhöht die Fallhöhe (v0 = √(2g(h+δ)))
// und senkt zugleich k = E·q/(L+δ).
export function effektiverSturzfaktor(f, delta, L) {
  if (f == null || !Number.isFinite(f)) return null;
  const LL = Number(L);
  if (!Number.isFinite(LL) || LL <= 0) return null;
  const ff = Math.max(0, f);
  return ff + (1 - ff) * (nn(delta) / LL);
}

// Fangstoß mit Schlappseil: bekannte Formel mit f_eff statt f (Gl. 6.12).
export function fangstossSchlappseil(m, M_N, f, delta, L) {
  return fangstoss(m, M_N, effektiverSturzfaktor(f, delta, L));
}

// ---- Körpersicherung (S. 21, Fig. 6-5) --------------------------------------

// Reduzierte Masse m_red = m·m0/(m0 + m).
export function reduzierteMasse(m, m0) {
  const mm = nn(m), m00 = nn(m0);
  if (mm + m00 <= 0) return 0;
  return (mm * m00) / (mm + m00);
}

// Fangstoß bei Sicherung am Körper/Gurt (S. 21, ungedämpfter harmonischer Oszillator):
//   F̃_R^HO = m_red·2g + m_red·√( Ω²·(v0 − u)² + (2g)² )   mit  Ω² = k/m_red
// Hier numerisch stabil als Identität m_red·√X = √(m_red²·X) geschrieben:
//   F̃ = 2g·m_red + √( m_red·k·(v0 − u)² + (2g·m_red)² )
// (m_red → 0 liefert damit 0 statt 0·∞ = NaN.)
// u = Absprunggeschwindigkeit des Sichernden (Default 0 = kein Absprung).
export function fangstossKoerpersicherung(m, m0, M_N, L, v0, uSprung = 0) {
  const k = federkonstante(M_N, L);
  if (k == null) return null;
  const mred = reduzierteMasse(m, m0);
  if (mred <= 0) return 0;
  const dv = nn(v0) - (Number.isFinite(Number(uSprung)) ? Number(uSprung) : 0);
  const stat = 2 * G * mred;
  const F = stat + Math.sqrt(mred * k * dv * dv + stat * stat);
  return Number.isFinite(F) ? F : null;
}

// ---- Aggregat: alles auf einmal, UI-freundliche Einheiten -------------------
// input: { m (kg), h (m), L (m), M (kN), c }
// Rückgabe: rohe SI-Werte + abgeleitete kN/J/%-Größen + Bewertung + Flags.
export function computeSturz(input = {}) {
  const m = nn(input.m);
  const h = nn(input.h);
  const Lraw = Number(input.L);
  const L = Number.isFinite(Lraw) ? Lraw : 0;
  const M_kN = pos(input.M, DEFAULTS.M);
  const M_N = M_kN * 1000;
  const c = clamp01(input.c ?? DEFAULTS.c);

  const f = sturzfaktor(h, L);                 // null wenn L ≤ 0
  const E = fallenergie(m, h);                 // J
  const v = aufprallGeschwindigkeit(h);        // m/s
  const F = fangstoss(m, M_N, f);              // N (null wenn f null)
  const epsRel = seildehnungRel(F, M_N);       // –
  const dAbs = seildehnungAbs(epsRel, L);      // m
  const Fanker = ankerkraft(F, c);             // N
  const Fsicherer = sichererkraft(F, c);       // N

  const F_kN = F == null ? null : F / 1000;
  const note = bewertung(F_kN);

  return {
    // Eingaben (bereinigt)
    in: { m, h, L, M_kN, c },
    // Sturzfaktor
    f,
    faktorUngueltig: f === null,               // L ≤ 0
    faktorExtrem: f != null && f > 2,          // Klettersteig-/Extrembereich
    // Energie
    energieJ: E,
    energiekJ: E / 1000,
    aufprallV: v,
    // Fangstoß
    fangstossN: F,
    fangstosskN: F_kN,
    bewertung: note,                            // {stufe, klasse} | null
    ueberUIAA: F_kN != null && F_kN > UIAA_LIMIT_KN,
    // Seildehnung
    dehnungRel: epsRel,                         // 0..1
    dehnungProzent: epsRel == null ? null : epsRel * 100,
    dehnungM: dAbs,                             // m
    dehnungUnphysikalisch: epsRel != null && epsRel > 0.5, // lineares Federmodell am Limit
    // Kräfte im System
    ankerkN: Fanker == null ? null : Fanker / 1000,
    sichererkN: Fsicherer == null ? null : Fsicherer / 1000,
  };
}

// ---- Aggregat Part-3-Dynamik ------------------------------------------------
// Rechnet die drei Zusatzeffekte GEGEN den Basis-Fangstoß aus computeSturz.
// computeSturz selbst bleibt unverändert — der Basis-Fangstoß ist und bleibt
// das primäre Ergebnis der App; diese Funktion liefert nur die Was-wäre-wenn-Werte.
// input: { m (kg), h (m), L (m), M (kN), s (m), delta (m), m0 (kg), uSprung (m/s) }
export function computeDynamik(input = {}) {
  const m = nn(input.m);
  const h = nn(input.h);
  const Lraw = Number(input.L);
  const L = Number.isFinite(Lraw) ? Lraw : 0;
  const M_kN = pos(input.M, DEFAULTS.M);
  const M_N = M_kN * 1000;
  const s = nn(input.s);
  const delta = nn(input.delta);
  const m0 = nn(input.m0);
  const uSprung = nn(input.uSprung);

  const f = sturzfaktor(h, L);
  const v0 = aufprallGeschwindigkeit(h);
  const w = omega(m, M_N, L);
  const F0 = fangstoss(m, M_N, f);                     // N, Basis
  const F0_kN = F0 == null ? null : F0 / 1000;

  const rel = (F) => (F == null || F0 == null || F0 <= 0 ? null : (F / F0 - 1) * 100);

  // — Seildurchlauf (Gl. 6.10) —
  // Über der Gültigkeitsgrenze wird NICHT weiter extrapoliert: gerechnet wird mit
  // min(s, 1 m), damit für s > 1 m keine zusätzliche Reduktion versprochen wird (S. 22).
  const sGerechnet = Math.min(s, SEILDURCHLAUF_MAX_M);
  const dl = m > 0 && f != null ? seildurchlaufOptimum(m, M_N, L, h, sGerechnet) : null;
  const linear = w != null && v0 > 0 ? fangstossLinearS(m, w, v0, sGerechnet) : null;
  const durchlauf = {
    kN: dl == null ? null : dl.FN / 1000,
    roh610kN: dl == null ? null : dl.F610N / 1000,
    linearkN: linear == null ? null : linear / 1000,
    linearGueltig: w == null ? false : linearGueltig(w, v0),
    aenderungProzent: dl == null ? null : rel(dl.FN),
    u: dl == null ? null : dl.u,
    sGerechnet,
    sMin: dl == null ? null : dl.sMin,
    gesaettigt: dl == null ? false : dl.gesaettigt,
    ueberGueltigkeit: s > SEILDURCHLAUF_MAX_M,          // Paper S. 22
  };

  // — Schlappseil (Gl. 6.12) —
  const fEff = effektiverSturzfaktor(f, delta, L);
  const Fschlapp = fangstossSchlappseil(m, M_N, f, delta, L);
  const schlapp = {
    fEff,
    deltaProL: L > 0 ? delta / L : null,
    kN: Fschlapp == null ? null : Fschlapp / 1000,
    aenderungProzent: rel(Fschlapp),
    erhoehtFangstoss: f != null && f < 1 && delta > 0,   // S. 21
    aktiv: delta > 0,
  };

  // — Körpersicherung (S. 21) —
  const Fkoerper = m0 > 0 ? fangstossKoerpersicherung(m, m0, M_N, L, v0, uSprung) : null;
  const koerper = {
    mRed: reduzierteMasse(m, m0),
    kN: Fkoerper == null ? null : Fkoerper / 1000,
    aenderungProzent: rel(Fkoerper),
    guenstiger: Fkoerper != null && F0 != null && Fkoerper < F0,
    aktiv: m0 > 0,
  };

  return {
    in: { m, h, L, M_kN, s, delta, m0, uSprung },
    f, v0, omega: w,
    basiskN: F0_kN,
    durchlauf, schlapp, koerper,
  };
}
