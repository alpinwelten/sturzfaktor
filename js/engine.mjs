// engine.mjs — reine Sturzfaktor-/Fangstoß-Physik (kein DOM, testbar).
// Modell: kanonische Kletterseil-Fangstoßformel (harmonischer Oszillator):
//   F = m·g + √( (m·g)² + 2·m·g·M·f )
// mit m = Systemmasse, g = 9,81 m/s², M = Seilmodul (E·A) in Newton, f = Sturzfaktor.
// Intern wird in SI gerechnet (N, m, kg, J); das UI liefert kN/m und bekommt kN/J/% zurück.

export const G = 9.81;            // m/s² Erdbeschleunigung
export const UIAA_MASS = 80;      // kg  Normsturz-Masse (EN 892 / UIAA 101, Einfachseil)
export const UIAA_FACTOR = 1.77;  // –   Normsturz-Sturzfaktor nach EN 892 / UIAA 101
export const UIAA_LIMIT_KN = 12;  // kN  max. zulässiger Fangstoß Einfachseil (EN 892)

// Seilmodul-Presets (kN) nach Seil-Steifigkeit; mittel ≈ modernes Einfachseil.
export const MODUL_PRESETS = { weich: 16, mittel: 20, steif: 24 };

export const DEFAULTS = { m: 80, h: 4, L: 10, M: 20, c: 0.66, uiaa: 8.5 };

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
export function ankerkraft(F_N, c) {
  if (F_N == null) return null;
  return (1 + clamp01(c)) * F_N;
}

// Kraft auf den Sicherer (Seilbremse): F_sicherer = c·F.
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
