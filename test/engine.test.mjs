import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  G, UIAA_MASS, UIAA_FACTOR, RHO_DAV, DEFAULTS, SEILDURCHLAUF_MAX_M,
  sturzfaktor, fallenergie, aufprallGeschwindigkeit, fangstoss,
  seildehnungRel, seildehnungAbs, ankerkraft, sichererkraft,
  modulAusUIAA, bewertung, computeSturz,
  cAusRho, rhoAusC, federkonstante, omega,
  durchlaufLaenge, uMin, t0Optimal, durchlaufSVonU, fangstossVonU,
  fangstossMaxZeiten, fangstossLinearS, linearGueltig, uAusS, seildurchlaufOptimum,
  effektiverSturzfaktor, fangstossSchlappseil,
  reduzierteMasse, fangstossKoerpersicherung, computeDynamik,
} from '../js/engine.mjs';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// ---------- Sturzfaktor ----------
test('sturzfaktor: f = h/L', () => {
  assert.ok(near(sturzfaktor(4, 10), 0.4));
  assert.ok(near(sturzfaktor(10, 5), 2));
  assert.ok(near(sturzfaktor(30, 10), 3));         // Extrembereich (>2) erlaubt
});
test('sturzfaktor: L ≤ 0 -> null (undefiniert)', () => {
  assert.equal(sturzfaktor(4, 0), null);
  assert.equal(sturzfaktor(4, -3), null);
});
test('sturzfaktor: negative Fallhöhe -> 0', () => {
  assert.equal(sturzfaktor(-4, 10), 0);
});

// ---------- Fallenergie & Geschwindigkeit ----------
test('fallenergie: E = m·g·h', () => {
  assert.ok(near(fallenergie(80, 4), 80 * G * 4));   // 3139,2 J
  assert.ok(near(fallenergie(80, 4), 3139.2));
});
test('aufprallGeschwindigkeit: v = √(2gh)', () => {
  assert.ok(near(aufprallGeschwindigkeit(4), Math.sqrt(2 * G * 4)));
  assert.ok(near(aufprallGeschwindigkeit(4), 8.858894, 1e-5));
});
test('Energie/Geschwindigkeit: negative/NaN -> 0', () => {
  assert.equal(fallenergie(-80, 4), 0);
  assert.equal(fallenergie(80, NaN), 0);
  assert.equal(aufprallGeschwindigkeit(-4), 0);
});

// ---------- Fangstoß (Referenz: UIAA-Normsturz) ----------
test('fangstoss: UIAA 80 kg / Modul 20 kN / f 1,77 ≈ 8,28 kN', () => {
  const F = fangstoss(80, 20000, UIAA_FACTOR);
  assert.ok(near(F, 8280.1, 0.5), `F=${F}`);
});
test('fangstoss: monoton steigend in f und in M', () => {
  assert.ok(fangstoss(80, 20000, 1.0) < fangstoss(80, 20000, 1.8));
  assert.ok(fangstoss(80, 16000, 1.0) < fangstoss(80, 24000, 1.0));
});
test('fangstoss: f = null (L≤0) -> null', () => {
  assert.equal(fangstoss(80, 20000, null), null);
});
test('fangstoss: f = 0 -> Modellgrenzfall 2·m·g', () => {
  assert.ok(near(fangstoss(80, 20000, 0), 2 * 80 * G, 1e-6));
});

// ---------- Seildehnung ----------
test('seildehnung: ε = F/M, d = ε·L', () => {
  const F = fangstoss(80, 20000, UIAA_FACTOR);     // ≈ 8280 N
  const eps = seildehnungRel(F, 20000);
  assert.ok(near(eps, F / 20000));
  assert.ok(eps > 0.28 && eps < 0.45);             // dynamischer Peak-Bereich
  assert.ok(near(seildehnungAbs(eps, 10), eps * 10));
});
test('seildehnung: F null oder M 0 -> null', () => {
  assert.equal(seildehnungRel(null, 20000), null);
  assert.equal(seildehnungRel(5000, 0), null);
});

// ---------- Anker- & Sichererkraft ----------
test('ankerkraft/sichererkraft: (1+c)·F und c·F', () => {
  const F = 8000;
  assert.ok(near(ankerkraft(F, 0.66), 1.66 * F));
  assert.ok(near(sichererkraft(F, 0.66), 0.66 * F));
});
test('ankerkraft: reibungsfrei (c=1) -> 2·F', () => {
  assert.ok(near(ankerkraft(8000, 1), 16000));
});
test('ankerkraft: c wird auf [0,1] geklemmt', () => {
  assert.ok(near(ankerkraft(8000, 5), 16000));      // >1 -> 1
  assert.ok(near(ankerkraft(8000, -2), 8000));      // <0 -> 0
});

// ---------- Seilmodul aus UIAA-Fangstoß (Round-Trip) ----------
test('modulAusUIAA: invertiert fangstoss exakt', () => {
  const M0 = 21000;                                 // N
  const Fuiaa = fangstoss(UIAA_MASS, M0, UIAA_FACTOR);
  const M = modulAusUIAA(Fuiaa);
  assert.ok(near(M, M0, 1), `M=${M}`);
});
test('modulAusUIAA: typisches Seil 8,5 kN -> ~21 kN', () => {
  const M = modulAusUIAA(8500);
  assert.ok(M / 1000 > 19 && M / 1000 < 23, `M=${M / 1000} kN`);
});
test('modulAusUIAA: F_UIAA ≤ m·g unphysikalisch -> null', () => {
  assert.equal(modulAusUIAA(500), null);
});

// ---------- Ampel ----------
test('bewertung: Schwellen 4/8/12 kN', () => {
  assert.equal(bewertung(3).stufe, 'gering');
  assert.equal(bewertung(4).stufe, 'gering');       // Grenze inklusiv
  assert.equal(bewertung(6).stufe, 'deutlich');
  assert.equal(bewertung(10).stufe, 'hoch');
  assert.equal(bewertung(13).stufe, 'kritisch');
});
test('bewertung: null/NaN -> null', () => {
  assert.equal(bewertung(null), null);
  assert.equal(bewertung(NaN), null);
});

// ---------- computeSturz (Aggregat) ----------
test('computeSturz: Default 80/4/10/20 → f=0,4, F≈4,41 kN, deutlich', () => {
  const r = computeSturz({ m: 80, h: 4, L: 10, M: 20, c: 0.66 });
  assert.ok(near(r.f, 0.4));
  assert.ok(near(r.fangstosskN, 4.414, 0.01), `F=${r.fangstosskN}`);
  assert.equal(r.bewertung.stufe, 'deutlich');
  assert.ok(near(r.energiekJ, 3.1392, 1e-3));
  assert.ok(!r.faktorUngueltig && !r.faktorExtrem && !r.ueberUIAA);
});
test('computeSturz: L=0 → Faktor ungültig, Fangstoß null, Energie bleibt', () => {
  const r = computeSturz({ m: 80, h: 4, L: 0, M: 20 });
  assert.equal(r.f, null);
  assert.ok(r.faktorUngueltig);
  assert.equal(r.fangstosskN, null);
  assert.equal(r.bewertung, null);
  assert.ok(near(r.energiekJ, 3.1392, 1e-3));       // Energie braucht kein L
});
test('computeSturz: f>2 wird als Extrembereich markiert', () => {
  const r = computeSturz({ m: 80, h: 30, L: 10, M: 20 });
  assert.ok(near(r.f, 3));
  assert.ok(r.faktorExtrem);
});
test('computeSturz: kritischer Fangstoß über UIAA-Grenze', () => {
  const r = computeSturz({ m: 150, h: 18, L: 9, M: 24, c: 0.66 }); // Faktor 2, schwer, steif
  assert.ok(r.fangstosskN > 12, `F=${r.fangstosskN}`);
  assert.ok(r.ueberUIAA);
  assert.equal(r.bewertung.stufe, 'kritisch');
});
test('computeSturz: negative/NaN-Eingaben vergiften nicht', () => {
  const r = computeSturz({ m: -80, h: NaN, L: 10, M: 20 });
  assert.ok(Number.isFinite(r.energieJ));
  assert.equal(r.energieJ, 0);
  assert.ok(r.f === 0);                              // h->0, L=10
});
test('computeSturz: Modul 0 fällt auf Default zurück (kein Infinity)', () => {
  const r = computeSturz({ m: 80, h: 4, L: 10, M: 0 });
  assert.ok(Number.isFinite(r.fangstosskN));
  assert.ok(near(r.in.M_kN, 20));
});
test('computeSturz: sehr große Werte bleiben endlich', () => {
  const r = computeSturz({ m: 5000, h: 1000, L: 1, M: 40 });
  assert.ok(Number.isFinite(r.fangstosskN) && r.fangstosskN > 0);
  assert.ok(Number.isFinite(r.energieJ));
});
test('computeSturz: Anker = 1,66·F, Sicherer = 0,66·F', () => {
  const r = computeSturz({ m: 80, h: 4, L: 10, M: 20, c: 0.66 });
  assert.ok(near(r.ankerkN, 1.66 * r.fangstosskN, 1e-9));
  assert.ok(near(r.sichererkN, 0.66 * r.fangstosskN, 1e-9));
});

// ============================================================================
// PART 3 — Leuthäusser, „Physics of climbing ropes – part 3" (2012)
//
// Die Referenzwerte unten sind UNABHÄNGIG von der Engine: sie sind entweder
// Literalzahlen aus dem Paper oder werden hier aus den Paper-Gleichungen neu
// hingeschrieben (Präfix `ref…`). Kein Test bestätigt die Engine mit sich selbst.
// ============================================================================

const g = 9.81;

// Bekannte Fangstoßformel in Paper-Schreibweise (S. 20/21):  F = mg + m·√(v0²ω² + g²)
const refFamiliar = (m, w, v0) => m * g + m * Math.sqrt(v0 * v0 * w * w + g * g);
// Gl. 6.9 (S. 20)
const refT0 = (u, w) => Math.asin(0.5 * (1 + 2 * g / (u * w))) / w;
// Gl. 6.10 (S. 20), s-Zweig und Kraft-Zweig
const refS610 = (u, w) => u * (Math.PI / (2 * w) - refT0(u, w));
const refF610 = (m, w, v0, u) => m * g + m * Math.sqrt(
  Math.pow(u * Math.sqrt(1 - Math.pow(0.5 * (1 + 2 * g / (w * u)), 2)) - v0, 2) * w * w
  + Math.pow(0.5 * u * w, 2));
// Gl. 6.11 (S. 20)
const refF611 = (m, w, v0, s) =>
  refFamiliar(m, w, v0) * (1 - (0.87 * w / v0 - 1.12 * g / (v0 * v0)) * s);
// Gl. 6.5/6.7 (S. 18)
const refFZeiten = (m, w, v0, u, t0, te) => {
  const F1 = m * g + m * Math.sqrt(
    Math.pow(v0 - u * Math.cos(w * t0), 2) * w * w + Math.pow(g - u * w * Math.sin(w * t0), 2));
  const F2 = m * g + m * Math.sqrt(
    Math.pow(v0 - u * Math.cos(w * t0) + u * Math.cos(w * te), 2) * w * w
    + Math.pow(g - u * w * Math.sin(w * t0) + u * w * Math.sin(w * te), 2));
  return Math.max(F1, F2);
};
// Körpersicherung S. 21, Fig. 6-5 (wörtliche Form mit m_red und Ω)
const refKoerper = (m, m0, k, v0, u = 0) => {
  const mred = (m * m0) / (m0 + m);
  const Om2 = k / mred;
  return mred * 2 * g + mred * Math.sqrt(Om2 * Math.pow(v0 - u, 2) + Math.pow(2 * g, 2));
};

// Alle Zahlen in einem (verschachtelten) Objekt endlich oder null?
function alleEndlich(x) {
  if (x === null || typeof x === 'boolean' || typeof x === 'string') return true;
  if (typeof x === 'number') return Number.isFinite(x);
  if (typeof x === 'object') return Object.values(x).every(alleEndlich);
  return true;
}

// ---------- Reibungsmodell c ↔ ρ ----------
test('c ↔ ρ: c = 1/ρ, Rundreise exakt', () => {
  assert.ok(near(cAusRho(1.46), 1 / 1.46, 1e-12));
  assert.ok(near(cAusRho(2), 0.5, 1e-12));
  assert.ok(near(rhoAusC(cAusRho(1.46)), 1.46, 1e-12));
  assert.ok(near(cAusRho(1), 1, 1e-12));           // reibungsfrei
});
test('c ↔ ρ: unphysikalische Werte -> null', () => {
  assert.equal(cAusRho(0.5), null);                // ρ = e^(μπ) ≥ 1
  assert.equal(cAusRho(NaN), null);
  assert.equal(rhoAusC(0), null);
  assert.equal(rhoAusC(1.5), null);                // c ≤ 1
});
test('Default c = 0,68 ist 1/ρ mit ρ = 1,46 (DAV)', () => {
  assert.equal(RHO_DAV, 1.46);
  assert.equal(DEFAULTS.c, 0.68);
  assert.ok(near(Math.round(cAusRho(RHO_DAV) * 100) / 100, 0.68, 1e-12),
    `1/1,46 = ${cAusRho(RHO_DAV)}`);
  assert.ok(Math.abs(cAusRho(RHO_DAV) - DEFAULTS.c) < 0.005);
});

// ---------- Federkonstante & ω ----------
test('federkonstante/omega: k = M/L, ω = √(k/m)', () => {
  assert.ok(near(federkonstante(20000, 10), 2000));
  assert.ok(near(omega(80, 20000, 10), Math.sqrt(2000 / 80)));
  assert.ok(near(omega(80, 20000, 10), 5, 1e-12));
  assert.equal(federkonstante(20000, 0), null);
  assert.equal(omega(0, 20000, 10), null);
  assert.equal(omega(80, 20000, -3), null);
});

// ---------- Äquivalenz App-Formel ↔ Paper-Formel (Ground Truth Abschn. 3) ----------
test('Äquivalenz: mg + √((mg)² + 2mg·M·f) ≡ mg + m·√(v0²ω² + g²)', () => {
  const faelle = [
    [80, 20000, 10, 4], [82, 20000, 10.35, 4.30], [50, 16000, 30, 6],
    [150, 24000, 9, 18], [80, 20000, 10, 0.2], [95, 21500, 7.5, 11.9],
  ];
  for (const [m, M, L, h] of faelle) {
    const f = h / L;
    const v0 = Math.sqrt(2 * g * h);
    const w = Math.sqrt(M / (L * m));                    // ω² = M/(L·m)
    const appF = fangstoss(m, M, f);                      // Engine
    const paperF = refFamiliar(m, w, v0);                 // Paper, unabhängig gerechnet
    assert.ok(near(appF, paperF, 1e-8), `m=${m} h=${h}: App ${appF} vs Paper ${paperF}`);
  }
});

// ---------- DAV-Validierung (Ground Truth Abschn. 8, Paper S. 24/25) ----------
test('DAV-Experiment: m=82, v0=9,185, L=10,35, M=20 kN, c≈0,68 -> Messbänder', () => {
  const v0 = 9.185;
  const h = (v0 * v0) / (2 * g);                          // 4,30 m
  assert.ok(near(h, 4.30, 0.005), `h=${h}`);
  const r = computeSturz({ m: 82, h, L: 10.35, M: 20, c: 0.68 });
  assert.ok(near(r.f, 4.30 / 10.35, 1e-3), `f=${r.f}`);
  assert.ok(r.fangstosskN >= 4.3 && r.fangstosskN <= 4.8, `F_R = ${r.fangstosskN} kN`);
  assert.ok(r.sichererkN >= 2.8 && r.sichererkN <= 3.3, `F_S = ${r.sichererkN} kN`);
  assert.ok(r.ankerkN >= 7.1 && r.ankerkN <= 8.0, `F_U = ${r.ankerkN} kN`);
});
test('DAV-Experiment: auch mit exaktem c = 1/1,46 innerhalb der Bänder', () => {
  const r = computeSturz({ m: 82, h: 4.30, L: 10.35, M: 20, c: 1 / RHO_DAV });
  assert.ok(r.fangstosskN >= 4.3 && r.fangstosskN <= 4.8, `F_R = ${r.fangstosskN}`);
  assert.ok(r.sichererkN >= 2.8 && r.sichererkN <= 3.3, `F_S = ${r.sichererkN}`);
  assert.ok(r.ankerkN >= 7.1 && r.ankerkN <= 8.0, `F_U = ${r.ankerkN}`);
  // Gl. 2.4: F_R/F_S = ρ
  assert.ok(near(r.fangstosskN / r.sichererkN, RHO_DAV, 1e-9));
});

// ---------- Gl. 6.8: Durchlauflänge, Referenzfall Fig. 6-2 ----------
test('Gl. 6.8: s = u·(te − t0), Fig.-6-2-Fall u=3, t0=0,075, te=0,3 -> 0,675 m', () => {
  assert.ok(near(durchlaufLaenge(3, 0.075, 0.3), 0.675, 1e-12),
    `s = ${durchlaufLaenge(3, 0.075, 0.3)}`);
  assert.ok(near(durchlaufLaenge(2, 0.1, 0.6), 1.0, 1e-12));
  assert.equal(durchlaufLaenge(3, 0.3, 0.075), 0);        // te < t0 -> 0
  assert.equal(durchlaufLaenge(NaN, 0.075, 0.3), 0);
});
test('Gl. 6.5/6.7: Fig.-6-2-Parameter reproduzieren das Paper-Modell', () => {
  const m = 82, w = 6.25, v0 = 9.185, u = 3, t0 = 0.075, te = 0.3;
  const F = fangstossMaxZeiten(m, w, v0, u, t0, te);
  assert.ok(near(F, refFZeiten(m, w, v0, u, t0, te), 1e-8), `F=${F}`);
  // Fig. 6-2: schwarze Kurve (u=0) ≈ 5,5 kN, rote Kurve (u=3) ≈ 4,05 kN
  const F0 = fangstossMaxZeiten(m, w, v0, 0, t0, te);
  assert.ok(near(F0, refFamiliar(m, w, v0), 1e-8));       // u=0 -> bekannte Formel
  assert.ok(F0 / 1000 > 5.4 && F0 / 1000 < 5.7, `F(u=0) = ${F0 / 1000} kN`);
  assert.ok(F / 1000 > 3.9 && F / 1000 < 4.3, `F(u=3) = ${F / 1000} kN`);
  assert.ok(F < F0);
});

// ---------- Gl. 6.9/6.10: Optimalsteuerung ----------
test('Gl. 6.9: t0(u) = arcsin(½(1+2g/(uω)))/ω, u ≥ 2g/ω', () => {
  const w = 5;
  assert.ok(near(uMin(w), 2 * g / w, 1e-12));
  assert.ok(near(t0Optimal(6, w), refT0(6, w), 1e-12));
  assert.ok(near(t0Optimal(uMin(w), w), Math.PI / (2 * w), 1e-12));  // arcsin(1)
  // u < 2g/ω: geklemmt statt NaN
  assert.ok(Number.isFinite(t0Optimal(0.1, w)));
  assert.ok(near(t0Optimal(0.1, w), Math.PI / (2 * w), 1e-12));
  assert.equal(t0Optimal(6, 0), null);
});
test('Gl. 6.10: s(u) und F(u) stimmen mit der unabhängigen Referenz überein', () => {
  const m = 82, w = 4.8544, v0 = 9.185;
  for (const u of [4.5, 5, 6.5, 9, 20]) {
    assert.ok(near(durchlaufSVonU(u, w), refS610(u, w), 1e-12), `s(u=${u})`);
    assert.ok(near(fangstossVonU(m, w, v0, u), refF610(m, w, v0, u), 1e-7), `F(u=${u})`);
  }
});
test('Gl. 6.10: u = 2g/ω liefert s = 0 und exakt den Basis-Fangstoß', () => {
  const m = 80, M = 20000, L = 10, h = 4;
  const w = omega(m, M, L), v0 = aufprallGeschwindigkeit(h);
  assert.ok(near(durchlaufSVonU(uMin(w), w), 0, 1e-9));
  assert.ok(near(fangstossVonU(m, w, v0, uMin(w)), refFamiliar(m, w, v0), 1e-7));
  assert.ok(near(fangstossVonU(m, w, v0, uMin(w)), fangstoss(m, M, h / L), 1e-7));
});
test('s→u-Inversion: konvergiert (Rundreise s → u → s) über 6 Größenordnungen', () => {
  const w = omega(82, 20000, 10.35);
  for (const s of [1e-4, 0.01, 0.1, 0.25, 0.675, 1, 5, 100]) {
    const u = uAusS(s, w);
    assert.ok(u >= uMin(w), `u=${u} unter 2g/ω`);
    const zurueck = durchlaufSVonU(u, w);
    assert.ok(Math.abs(zurueck - s) <= 1e-9 * Math.max(1, s),
      `s=${s} -> u=${u} -> s'=${zurueck}`);
  }
  assert.ok(near(uAusS(0, w), uMin(w), 1e-12));           // s = 0 -> Untergrenze
  assert.equal(uAusS(0.5, null), null);
});
test('s→u-Inversion: unerreichbar großes s bleibt endlich (kein Hänger)', () => {
  const w = omega(80, 20000, 10);
  const u = uAusS(1e12, w);
  assert.ok(Number.isFinite(u) && u > 0, `u=${u}`);
  assert.ok(Number.isFinite(fangstossVonU(80, w, 8.86, u)));
});

// ---------- Seildurchlauf: App-Verhalten (Gl. 6.10 verbindlich) ----------
test('Seildurchlauf: F(0) = Basis-Fangstoß, monoton nicht steigend auf [0;1 m], nie < mg', () => {
  const m = 82, M = 20000, L = 10.35, h = 4.30;
  const basis = fangstoss(m, M, h / L);
  const r0 = seildurchlaufOptimum(m, M, L, h, 0);
  assert.ok(near(r0.FN, basis, 1e-6), `F(0)=${r0.FN} vs ${basis}`);

  let prev = Infinity;
  for (let i = 0; i <= 100; i++) {
    const r = seildurchlaufOptimum(m, M, L, h, i / 100);
    assert.ok(Number.isFinite(r.FN));
    assert.ok(r.FN <= prev + 1e-9, `nicht monoton bei s=${i / 100}`);
    assert.ok(r.FN >= m * G - 1e-9, `unter mg bei s=${i / 100}`);
    prev = r.FN;
  }
  // deutliche Reduktion im realistischen Fall
  const r1 = seildurchlaufOptimum(m, M, L, h, 1);
  assert.ok(r1.FN / basis < 0.75, `Reduktion bei 1 m: ${r1.FN / basis}`);
  assert.ok(!r1.ueberGueltigkeit && seildurchlaufOptimum(m, M, L, h, 1.5).ueberGueltigkeit);
});
test('Seildurchlauf: App-Wert = roher Gl.-6.10-Wert im gültigen Bereich (v0 groß)', () => {
  const m = 82, M = 20000, L = 10.35, h = 4.30;
  const w = omega(m, M, L), v0 = aufprallGeschwindigkeit(h);
  assert.ok(linearGueltig(w, v0));
  for (const s of [0.1, 0.3, 0.5, 0.75, 1]) {
    const r = seildurchlaufOptimum(m, M, L, h, s);
    assert.ok(near(r.FN, r.F610N, 1e-6), `s=${s}: ${r.FN} vs ${r.F610N}`);
    assert.ok(near(r.FN, refF610(m, w, v0, uAusS(s, w)), 1e-6));  // gegen Referenz
    assert.ok(!r.gesaettigt);
  }
});
test('Seildurchlauf: bei Mini-Sturzfaktor sättigt Gl. 6.10 (keine Reduktion versprochen)', () => {
  // f = 0,02: v0 = 1,98 m/s liegt unter 1,12g/(0,87ω) -> Gl. 6.10 hat ein Minimum
  const m = 80, M = 20000, L = 10, h = 0.2;
  const w = omega(m, M, L), v0 = aufprallGeschwindigkeit(h);
  assert.ok(near(h / L, 0.02, 1e-12));
  assert.ok(!linearGueltig(w, v0), 'Linearisierung dürfte hier nicht gelten');
  const r = seildurchlaufOptimum(m, M, L, h, 1);
  assert.ok(r.gesaettigt, 'Sättigung nicht erkannt');
  assert.ok(r.sMin > 0 && r.sMin < 1, `sMin=${r.sMin}`);
  assert.ok(r.FN < r.F610N, 'roher 6.10-Wert steigt hier wieder an');
  assert.ok(r.FN <= r.F0N + 1e-9);
  // nie unter mg und nie NaN
  assert.ok(r.FN >= m * G);
});
test('Gl. 6.11: Konsistenz mit Gl. 6.10 für kleine s (< 1,5 % Abweichung)', () => {
  const m = 82, M = 20000, L = 10.35, h = 4.30;
  const w = omega(m, M, L), v0 = aufprallGeschwindigkeit(h);
  let letzte = 0;
  for (const s of [0.02, 0.05, 0.1]) {
    const F610 = seildurchlaufOptimum(m, M, L, h, s).FN;
    const F611 = fangstossLinearS(m, w, v0, s);
    assert.ok(near(F611, refF611(m, w, v0, s), 1e-8), 'Gl. 6.11 ≠ Referenz');
    const abw = Math.abs(F611 / F610 - 1);
    assert.ok(abw < 0.015, `s=${s}: Abweichung ${(abw * 100).toFixed(2)} %`);
    assert.ok(abw >= letzte, 'Abweichung sollte mit s wachsen');
    letzte = abw;
  }
});
test('Gl. 6.11: Gültigkeitsgrenze v0 > 1,12·g/(0,87·ω)', () => {
  assert.ok(linearGueltig(4.8544, 9.185));
  assert.ok(!linearGueltig(5, 1.9809));
  assert.ok(!linearGueltig(5, 0));
  assert.ok(!linearGueltig(0, 9));
  assert.equal(fangstossLinearS(80, 5, 0, 0.5), null);   // v0 = 0 -> null statt Infinity
});

// ---------- Schlappseil (Gl. 6.12) ----------
test('Gl. 6.12: f_eff = f + (1−f)·δ/L', () => {
  assert.ok(near(effektiverSturzfaktor(0.4, 1, 10), 0.4 + 0.6 * 0.1, 1e-12));
  assert.ok(near(effektiverSturzfaktor(0.4, 0, 10), 0.4, 1e-12));
  assert.ok(near(effektiverSturzfaktor(1, 2, 10), 1, 1e-12));      // f = 1 -> δ wirkungslos
  assert.ok(near(effektiverSturzfaktor(1.5, 1, 10), 1.5 - 0.5 * 0.1, 1e-12));
  assert.ok(near(effektiverSturzfaktor(0.4, -5, 10), 0.4, 1e-12)); // δ < 0 -> 0
  assert.equal(effektiverSturzfaktor(null, 1, 10), null);
  assert.equal(effektiverSturzfaktor(0.4, 1, 0), null);
});
test('Schlappseil: f < 1 -> Fangstoß steigt mit δ; f = 1 -> δ wirkungslos; f > 1 -> sinkt', () => {
  const m = 80, M = 20000, L = 10;
  const F = (f, d) => fangstossSchlappseil(m, M, f, d, L);
  // f = 0,4 (Halle/Klettergarten): streng steigend
  let prev = -Infinity;
  for (const d of [0, 0.25, 0.5, 1, 2, 3]) { const v = F(0.4, d); assert.ok(v > prev, `δ=${d}`); prev = v; }
  assert.ok(F(0.4, 0) < F(0.4, 1) && F(0.4, 1) < F(0.4, 2));
  // f = 1: unverändert
  assert.ok(near(F(1, 0), F(1, 3), 1e-9));
  // f = 1,5 (im Paper nur theoretisch): sinkt
  assert.ok(F(1.5, 2) < F(1.5, 0));
  // Gegen die Referenzformel: F = mg + √(2mg·M·f_eff + (mg)²)
  const mg = m * g, fEff = 0.4 + 0.6 * (1 / L);
  assert.ok(near(F(0.4, 1), mg + Math.sqrt(2 * mg * M * fEff + mg * mg), 1e-8));
});

// ---------- Körpersicherung (S. 21, Fig. 6-5) ----------
test('Körpersicherung: m_red = m·m0/(m0+m)', () => {
  assert.ok(near(reduzierteMasse(80, 80), 40, 1e-12));
  assert.ok(near(reduzierteMasse(82, 60), (82 * 60) / 142, 1e-12));
  assert.equal(reduzierteMasse(80, 0), 0);
  assert.equal(reduzierteMasse(0, 0), 0);
});
test('Körpersicherung: Formel S. 21 exakt wie im Paper', () => {
  const m = 82, M = 20000, L = 10.35, v0 = 9.185, k = M / L;
  for (const m0 of [40, 60, 80, 120]) {
    assert.ok(near(fangstossKoerpersicherung(m, m0, M, L, v0), refKoerper(m, m0, k, v0), 1e-8),
      `m0=${m0}`);
  }
  // Absprung u senkt die wirksame Anfangsgeschwindigkeit
  assert.ok(near(fangstossKoerpersicherung(m, 80, M, L, v0, 1.5), refKoerper(m, 80, k, v0, 1.5), 1e-8));
  assert.ok(fangstossKoerpersicherung(m, 80, M, L, v0, 1.5) < fangstossKoerpersicherung(m, 80, M, L, v0, 0));
});
test('Körpersicherung: F̃ < F für m0 = 50…120 kg (sonst gleiche Parameter)', () => {
  const m = 82, M = 20000, L = 10.35, h = 4.30, v0 = Math.sqrt(2 * g * h);
  const F = fangstoss(m, M, h / L);
  for (let m0 = 50; m0 <= 120; m0 += 5) {
    const Ft = fangstossKoerpersicherung(m, m0, M, L, v0);
    assert.ok(Ft < F, `m0=${m0}: F̃=${Ft} ≥ F=${F}`);
  }
  // je schwerer der Sichernde, desto größer F̃ (monoton)
  let prev = 0;
  for (let m0 = 50; m0 <= 120; m0 += 5) {
    const Ft = fangstossKoerpersicherung(m, m0, M, L, v0);
    assert.ok(Ft > prev); prev = Ft;
  }
});
test('Körpersicherung: lim(m0→∞) F̃ = 2mg + m·√(v0²ω² + 4g²) auf 1e-9', () => {
  const m = 82, M = 20000, L = 10.35, v0 = 9.185;
  const w = Math.sqrt(M / (L * m));
  const grenzwert = 2 * m * g + m * Math.sqrt(v0 * v0 * w * w + 4 * g * g);
  const F = fangstossKoerpersicherung(m, 1e16, M, L, v0);
  assert.ok(Math.abs(F - grenzwert) < 1e-9, `|${F} − ${grenzwert}| = ${Math.abs(F - grenzwert)}`);
  // Konvergenz: Abstand fällt monoton mit wachsendem m0
  let prev = Infinity;
  for (const m0 of [1e3, 1e6, 1e9, 1e12]) {
    const d = Math.abs(fangstossKoerpersicherung(m, m0, M, L, v0) - grenzwert);
    assert.ok(d < prev, `m0=${m0}: ${d} ≥ ${prev}`); prev = d;
  }
  // der Grenzwert liegt ÜBER der Fixpunkt-Formel (2g-Terme des Modells)
  assert.ok(grenzwert > fangstoss(m, M, (v0 * v0 / (2 * g)) / L));
});

// ---------- Numerische Robustheit ----------
test('Robustheit: Grenz- und Unsinnseingaben liefern nie NaN/Infinity', () => {
  const proben = [
    () => seildurchlaufOptimum(80, 20000, 10, 4, 1e12),     // s über erreichbarem Maximum
    () => seildurchlaufOptimum(80, 20000, 10, 4, -5),       // s < 0
    () => seildurchlaufOptimum(80, 20000, 0, 4, 0.5),       // L = 0
    () => seildurchlaufOptimum(0, 20000, 10, 4, 0.5),       // m = 0
    () => seildurchlaufOptimum(80, 20000, 10, 0, 0.5),      // h = 0 -> v0 = 0
    () => fangstossVonU(80, 5, 8.86, 0.1),                  // u < 2g/ω
    () => fangstossVonU(80, 5, 8.86, 1e15),
    () => t0Optimal(0.001, 5),
    () => durchlaufSVonU(0.001, 5),
    () => fangstossKoerpersicherung(80, 0, 20000, 10, 8.86),   // m0 = 0
    () => fangstossKoerpersicherung(80, 80, 20000, 0, 8.86),   // L = 0
    () => fangstossKoerpersicherung(0, 80, 20000, 10, 8.86),   // m = 0
    () => effektiverSturzfaktor(0.4, -3, 10),                  // δ < 0
    () => fangstossSchlappseil(80, 20000, 0.4, -3, 0),         // δ < 0 und L = 0
    () => fangstossLinearS(80, 5, 0, 1),                       // v0 = 0
    () => uAusS(1e9, 5),
  ];
  for (const [i, p] of proben.entries()) {
    const v = p();
    assert.ok(alleEndlich(v), `Probe ${i}: ${JSON.stringify(v)}`);
  }
});
test('Robustheit: computeDynamik bleibt bei Unsinnseingaben endlich', () => {
  const faelle = [
    { m: -80, h: NaN, L: 0, M: 0, s: -1, delta: -2, m0: -9 },
    { m: 80, h: 4, L: 10, M: 20, s: 1e9, delta: 1e9, m0: 1e9 },
    { m: 5000, h: 1000, L: 1, M: 40, s: 1, delta: 1, m0: 80 },
    {},
  ];
  for (const f of faelle) {
    const d = computeDynamik(f);
    assert.ok(alleEndlich(d), `${JSON.stringify(f)} -> ${JSON.stringify(d)}`);
  }
});

// ---------- Aggregat computeDynamik ----------
test('computeDynamik: Basiswert = computeSturz, s/δ/m0 = 0 lässt alles unverändert', () => {
  const inp = { m: 80, h: 4, L: 10, M: 20, s: 0, delta: 0, m0: 0 };
  const d = computeDynamik(inp);
  const r = computeSturz({ ...inp, c: DEFAULTS.c });
  assert.ok(near(d.basiskN, r.fangstosskN, 1e-12));
  assert.ok(near(d.durchlauf.kN, d.basiskN, 1e-9));
  assert.ok(near(d.schlapp.kN, d.basiskN, 1e-9));
  assert.equal(d.koerper.aktiv, false);
  assert.equal(d.koerper.kN, null);
  assert.ok(near(d.omega, 5, 1e-12));
});
test('computeDynamik: alle drei Effekte in kN, Vorzeichen der Änderungen stimmt', () => {
  const d = computeDynamik({ m: 80, h: 4, L: 10, M: 20, s: 0.5, delta: 1, m0: 80 });
  assert.ok(d.durchlauf.aenderungProzent < 0, 'Seildurchlauf muss senken');
  assert.ok(d.schlapp.aenderungProzent > 0, 'Schlappseil muss bei f = 0,4 erhöhen');
  assert.ok(d.schlapp.erhoehtFangstoss);
  assert.ok(d.koerper.aenderungProzent < 0 && d.koerper.guenstiger);
  assert.ok(near(d.koerper.mRed, 40, 1e-12));
  // Werte in kN plausibel
  for (const v of [d.durchlauf.kN, d.schlapp.kN, d.koerper.kN]) {
    assert.ok(v > 0 && v < 20, `kN=${v}`);
  }
});
test('computeDynamik: L = 0 -> keine Dynamik-Werte, aber kein Absturz', () => {
  const d = computeDynamik({ m: 80, h: 4, L: 0, M: 20, s: 0.5, delta: 1, m0: 80 });
  assert.equal(d.f, null);
  assert.equal(d.basiskN, null);
  assert.equal(d.durchlauf.kN, null);
  assert.equal(d.schlapp.kN, null);
  assert.equal(d.koerper.kN, null);
});
test('Kleinsturzfaktor f = 0,02: Basis-Fangstoß gegen Handrechnung', () => {
  // m = 80, M = 20 kN, h = 0,2 m, L = 10 m  ->  f = 0,02
  // F = 784,8 + √(784,8² + 2·784,8·20000·0,02) N = 1900,04 N
  const F = fangstoss(80, 20000, 0.2 / 10);
  assert.ok(near(F, 1900.035, 0.01), `F=${F}`);
  assert.ok(near(F, 784.8 + Math.sqrt(784.8 ** 2 + 2 * 784.8 * 20000 * 0.02), 1e-6));
  // deutlich über dem statischen Wert, aber weit unter dem Normsturz
  assert.ok(F > 2 * 80 * g && F < fangstoss(80, 20000, UIAA_FACTOR));
});
test('computeDynamik: über s = 1 m wird nicht weiter extrapoliert', () => {
  assert.equal(SEILDURCHLAUF_MAX_M, 1);
  const bei1 = computeDynamik({ m: 82, h: 4.3, L: 10.35, M: 20, s: 1 });
  const bei3 = computeDynamik({ m: 82, h: 4.3, L: 10.35, M: 20, s: 3 });
  assert.ok(near(bei1.durchlauf.kN, bei3.durchlauf.kN, 1e-12), 'Wert über 1 m nicht gedeckelt');
  assert.equal(bei1.durchlauf.ueberGueltigkeit, false);
  assert.equal(bei3.durchlauf.ueberGueltigkeit, true);
  assert.ok(near(bei3.durchlauf.sGerechnet, 1, 1e-12));
  // die Engine-Primitive selbst rechnet ungedeckelt weiter (Paper-Funktion bleibt Paper-Funktion)
  const roh = seildurchlaufOptimum(82, 20000, 10.35, 4.3, 3);
  assert.ok(roh.FN < seildurchlaufOptimum(82, 20000, 10.35, 4.3, 1).FN);
});
