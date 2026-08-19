import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSturz, computeDynamik } from '../js/engine.mjs';
import {
  TESTS_STORE, TESTS_SCHEMA, BLATT_NAME, SPALTEN,
  neuerBestand, parseBestand, testHinzufuegen, testEntfernen, alleEntfernen,
  testZuZeile, hinweise, formatZeit, formatZeitKurz, dateiname,
} from '../js/protokoll.mjs';

const FIX_MS = new Date(2026, 7, 19, 14, 32).getTime();
const EINGABEN_DEFAULT = {
  m: 80, h: 4, L: 10, M: 20, uiaa: 8.5, uiaaOn: false, mEff: 20,
  c: 0.68, s: 0, delta: 0, m0: 0,
};
const idx = (key) => SPALTEN.findIndex((s) => s.key === key);

// Echter Testeintrag über die echte Engine (kein Mock)
function echterTest(bestand, eingaben = EINGABEN_DEFAULT, ms = FIX_MS) {
  const inp = { m: eingaben.m, h: eingaben.h, L: eingaben.L, M: eingaben.mEff, c: eingaben.c, s: eingaben.s, delta: eingaben.delta, m0: eingaben.m0 };
  return testHinzufuegen(bestand, eingaben, computeSturz(inp), computeDynamik(inp), ms);
}

// ---------- Konstanten ----------
test('Konstanten: Store-Key, Schema, Blattname', () => {
  assert.equal(TESTS_STORE, 'sturzfaktor.tests.v1');
  assert.equal(TESTS_SCHEMA, 1);
  assert.equal(BLATT_NAME, 'Testprotokoll');
});

// ---------- Spalten ----------
test('SPALTEN: 28 eindeutige Spalten, alle NUM_FIELDS-Eingaben vertreten', () => {
  // Spiegel von app.js NUM_FIELDS (in-m, in-h, in-L, in-M, in-uiaa, in-c, in-s, in-delta, in-m0)
  const numKeys = ['m', 'h', 'L', 'M', 'uiaa', 'c', 's', 'delta', 'm0'];
  const keys = SPALTEN.map((s) => s.key);
  for (const k of numKeys) assert.ok(keys.includes(k), `Eingabespalte fehlt: ${k}`);
  assert.equal(SPALTEN.length, 28);
  assert.equal(new Set(keys).size, 28);
  for (const s of SPALTEN) assert.ok(typeof s.titel === 'string' && s.titel.length > 0);
});

// ---------- Zeilen-Mapping mit echter Engine ----------
test('testZuZeile: Standardsturz — Werte, Formate, leere Zellen', () => {
  const b = neuerBestand();
  const t = echterTest(b);
  const zeile = testZuZeile(t);

  assert.equal(zeile.length, SPALTEN.length);
  assert.equal(zeile[idx('name')], 'Test 1');
  assert.equal(zeile[idx('zeit')], '19.08.2026 14:32');
  assert.equal(zeile[idx('m')], 80);
  assert.equal(zeile[idx('L')], 10);
  assert.equal(zeile[idx('uiaaOn')], 'nein');
  assert.equal(zeile[idx('mEff')], 20);
  assert.ok(Math.abs(zeile[idx('f')] - 0.4) < 1e-9);
  assert.ok(Math.abs(zeile[idx('fangstosskN')] - 4.414) < 0.01);   // Handrechnung
  assert.ok(Math.abs(zeile[idx('energieJ')] - 3139.2) < 1e-6);
  assert.equal(zeile[idx('stufe')], 'deutlich');
  // s = 0 / δ = 0: Part-3-Werte = Basiswert
  assert.ok(Math.abs(zeile[idx('durchlaufkN')] - zeile[idx('fangstosskN')]) < 1e-9);
  assert.ok(Math.abs(zeile[idx('schlappkN')] - zeile[idx('fangstosskN')]) < 1e-9);
  // m0 = 0: Körpersicherung aus -> leere Zelle (null), m_red = 0
  assert.equal(zeile[idx('koerperkN')], null);
  assert.equal(zeile[idx('mRed')], 0);
  // keine Flags -> Hinweise leer (null = leere Excel-Zelle)
  assert.equal(zeile[idx('hinweise')], null);
});

test('testZuZeile: UIAA-Modus wird als „ja" exportiert', () => {
  const b = neuerBestand();
  const t = echterTest(b, { ...EINGABEN_DEFAULT, uiaaOn: true, mEff: 22.8 });
  assert.equal(testZuZeile(t)[idx('uiaaOn')], 'ja');
});

test('testZuZeile: Extremsturz f = 3 setzt Hinweis „f > 2"', () => {
  const b = neuerBestand();
  const t = echterTest(b, { ...EINGABEN_DEFAULT, h: 30, L: 10 });
  const zeile = testZuZeile(t);
  assert.ok(Math.abs(zeile[idx('f')] - 3) < 1e-9);
  assert.ok(String(zeile[idx('hinweise')]).includes('f > 2'));
});

// ---------- Hinweise (Flag-Kombinatorik) ----------
test('hinweise: einzelne Flags und Kombination mit ·', () => {
  assert.equal(hinweise({}), '');
  assert.equal(hinweise({ faktorUngueltig: true }), 'Seil = 0: kein Fangstoß');
  assert.equal(hinweise({ faktorExtrem: true }), 'f > 2');
  assert.equal(hinweise({ ueberUIAA: true }), 'über UIAA 12 kN');
  assert.equal(hinweise({ dehnungUnphysikalisch: true }), 'Modellgrenze Dehnung');
  assert.equal(
    hinweise({ faktorExtrem: true, ueberUIAA: true, dehnungUnphysikalisch: true }),
    'f > 2 · über UIAA 12 kN · Modellgrenze Dehnung'
  );
});

// ---------- Zähler-Semantik ----------
test('Zähler: fortlaufend, Löschen recycelt nie, Alle löschen setzt zurück', () => {
  const b = neuerBestand();
  assert.equal(b.nextNr, 1);
  echterTest(b); echterTest(b); echterTest(b);
  assert.deepEqual(b.tests.map((t) => t.name), ['Test 1', 'Test 2', 'Test 3']);
  assert.equal(b.nextNr, 4);

  testEntfernen(b, 2);
  assert.deepEqual(b.tests.map((t) => t.nr), [1, 3]);
  assert.equal(b.nextNr, 4);                     // Nummer 2 wird NICHT wiederverwendet

  const t4 = echterTest(b);
  assert.equal(t4.name, 'Test 4');

  const leer = alleEntfernen(b);
  assert.equal(leer.schema, TESTS_SCHEMA);
  assert.equal(leer.nextNr, 1);                  // Neustart bei leerem Protokoll
  assert.deepEqual(leer.tests, []);
});

// ---------- parseBestand: Robustheit ----------
test('parseBestand: null/kaputt/fremdes Schema -> frischer Bestand', () => {
  assert.deepEqual(parseBestand(null), neuerBestand());
  assert.deepEqual(parseBestand('kaputt{'), neuerBestand());
  assert.deepEqual(parseBestand('{"schema":99,"nextNr":7,"tests":[]}'), neuerBestand());
  assert.deepEqual(parseBestand('{"schema":1,"nextNr":2,"tests":"x"}'), neuerBestand());
});

test('parseBestand: repariert zu kleinen Zähler (nextNr >= max nr + 1)', () => {
  const rep = parseBestand('{"schema":1,"nextNr":1,"tests":[{"nr":5,"name":"Test 5","zeit":0,"eingaben":{},"ergebnisse":{}}]}');
  assert.equal(rep.nextNr, 6);
  assert.equal(rep.tests.length, 1);
});

test('parseBestand: JSON-Round-Trip verlustfrei', () => {
  const b = neuerBestand();
  echterTest(b);
  echterTest(b, { ...EINGABEN_DEFAULT, m0: 70 });
  assert.deepEqual(parseBestand(JSON.stringify(b)), b);
});

// ---------- NaN-Sanitizing ----------
test('testHinzufuegen: NaN-Eingaben werden zu null, Stubs stürzen nicht', () => {
  const b = neuerBestand();
  const t = testHinzufuegen(b, { ...EINGABEN_DEFAULT, m: NaN, uiaa: NaN }, {}, {}, FIX_MS);
  assert.equal(t.eingaben.m, null);
  assert.equal(t.eingaben.uiaa, null);
  const zeile = testZuZeile(t);
  assert.equal(zeile.length, SPALTEN.length);
  assert.equal(zeile[idx('m')], null);
  assert.equal(zeile[idx('fangstosskN')], null);  // Stub {} -> überall null, nie 0
});

// ---------- Zeit- und Dateinamensformate (deterministisch, ohne Locale) ----------
test('formatZeit/formatZeitKurz/dateiname: gepolsterte Handformate', () => {
  const ms = new Date(2026, 0, 5, 9, 7).getTime();
  assert.equal(formatZeit(ms), '05.01.2026 09:07');
  assert.equal(formatZeitKurz(ms), '05.01. 09:07');
  assert.equal(formatZeit(FIX_MS), '19.08.2026 14:32');
  assert.equal(dateiname(new Date(2026, 0, 5)), 'Sturzfaktor-Testprotokoll_2026-01-05.xlsx');
});
