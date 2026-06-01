import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  G, UIAA_MASS, UIAA_FACTOR,
  sturzfaktor, fallenergie, aufprallGeschwindigkeit, fangstoss,
  seildehnungRel, seildehnungAbs, ankerkraft, sichererkraft,
  modulAusUIAA, bewertung, computeSturz,
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
