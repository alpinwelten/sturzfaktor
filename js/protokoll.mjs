// protokoll.mjs — Testprotokoll: Spaltendefinition, Snapshot→Zeile, Zähler- und
// Storage-Form. DOM-frei; Zeitformate bewusst von Hand (padStart) statt
// toLocaleString, damit Node-Tests und Safari identisch formatieren.
//
// Storage-Key ist bewusst von `sturzfaktor.v1` (Live-Eingaben) getrennt; die
// Ergebnisse werden ROH mitgespeichert, damit alte Protokolle auch nach
// späteren Engine-Änderungen dokumentieren, was damals gerechnet wurde.

export const TESTS_STORE = 'sturzfaktor.tests.v1';
export const TESTS_SCHEMA = 1;
export const BLATT_NAME = 'Testprotokoll';

// Excel-Spalten in Exportreihenfolge; key adressiert den Wert aus testZuZeile().
export const SPALTEN = [
  { key: 'name', titel: 'Name' },
  { key: 'zeit', titel: 'Zeitpunkt' },
  { key: 'm', titel: 'Systemmasse m [kg]' },
  { key: 'h', titel: 'Freie Fallhöhe h [m]' },
  { key: 'L', titel: 'Ausgegebenes Seil L [m]' },
  { key: 'M', titel: 'Seilmodul M (Eingabe) [kN]' },
  { key: 'uiaa', titel: 'UIAA-Fangstoß (Datenblatt) [kN]' },
  { key: 'uiaaOn', titel: 'Modul aus UIAA' },
  { key: 'mEff', titel: 'Seilmodul effektiv [kN]' },
  { key: 'c', titel: 'Umlenk-Reibung c [–]' },
  { key: 's', titel: 'Seildurchlauf s [m]' },
  { key: 'delta', titel: 'Schlappseil δ [m]' },
  { key: 'm0', titel: 'Masse Sichernder m₀ [kg]' },
  { key: 'fangstosskN', titel: 'Fangstoß [kN]' },
  { key: 'f', titel: 'Sturzfaktor f [–]' },
  { key: 'energieJ', titel: 'Fallenergie [J]' },
  { key: 'aufprallV', titel: 'Aufprall [m/s]' },
  { key: 'dehnungProzent', titel: 'Seildehnung [%]' },
  { key: 'dehnungM', titel: 'Seildehnung [m]' },
  { key: 'ankerkN', titel: 'Kraft Zwischensicherung [kN]' },
  { key: 'sichererkN', titel: 'Kraft Sicherer [kN]' },
  { key: 'stufe', titel: 'Ampel' },
  { key: 'durchlaufkN', titel: 'Fangstoß mit Seildurchlauf [kN]' },
  { key: 'schlappkN', titel: 'Fangstoß mit Schlappseil [kN]' },
  { key: 'fEff', titel: 'f_eff Schlappseil [–]' },
  { key: 'koerperkN', titel: 'Fangstoß mit Körpersicherung [kN]' },
  { key: 'mRed', titel: 'm_red [kg]' },
  { key: 'hinweise', titel: 'Hinweise' },
];

// Zahl-Sanitizer: NaN/±Infinity/leer -> null (überlebt JSON; wird leere Excel-Zelle).
// Achtung: null darf NICHT über Number(null) zu 0 werden.
function zahl(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const p2 = (n) => String(n).padStart(2, '0');

export function formatZeit(ms) {
  const d = new Date(ms);
  return `${p2(d.getDate())}.${p2(d.getMonth() + 1)}.${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

export function formatZeitKurz(ms) {
  const d = new Date(ms);
  return `${p2(d.getDate())}.${p2(d.getMonth() + 1)}. ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

export function dateiname(datum) {
  return `Sturzfaktor-Testprotokoll_${datum.getFullYear()}-${p2(datum.getMonth() + 1)}-${p2(datum.getDate())}.xlsx`;
}

export function neuerBestand() {
  return { schema: TESTS_SCHEMA, nextNr: 1, tests: [] };
}

// localStorage-Rohtext -> Bestand. Kaputt/fremd -> frisch; zu kleiner Zähler wird
// defensiv angehoben (Hand-Edits), damit Namen eindeutig bleiben.
export function parseBestand(text) {
  let roh = null;
  try { roh = JSON.parse(text); } catch { return neuerBestand(); }
  if (!roh || typeof roh !== 'object' || roh.schema !== TESTS_SCHEMA || !Array.isArray(roh.tests)) {
    return neuerBestand();
  }
  const tests = roh.tests.filter((t) => t && typeof t === 'object' && Number.isFinite(t.nr));
  const maxNr = tests.reduce((mx, t) => Math.max(mx, t.nr), 0);
  const nextNr = Math.max(Number.isFinite(roh.nextNr) ? roh.nextNr : 1, maxNr + 1, 1);
  return { schema: TESTS_SCHEMA, nextNr, tests };
}

// Snapshot -> Testeintrag. sturz/dynamik sind die Engine-Objekte; fehlende Teile
// (Stubs, künftige Engine-Umbauten) führen zu null-Zellen, nie zu Abstürzen.
export function testHinzufuegen(bestand, eingaben, sturz, dynamik, zeitMs) {
  const nr = bestand.nextNr;
  const t = {
    nr,
    name: `Test ${nr}`,
    zeit: zahl(zeitMs) ?? 0,
    eingaben: {
      m: zahl(eingaben.m), h: zahl(eingaben.h), L: zahl(eingaben.L),
      M: zahl(eingaben.M), uiaa: zahl(eingaben.uiaa),
      uiaaOn: !!eingaben.uiaaOn, mEff: zahl(eingaben.mEff),
      c: zahl(eingaben.c), s: zahl(eingaben.s), delta: zahl(eingaben.delta), m0: zahl(eingaben.m0),
    },
    ergebnisse: {
      f: zahl(sturz?.f),
      fangstosskN: zahl(sturz?.fangstosskN),
      energieJ: zahl(sturz?.energieJ),
      aufprallV: zahl(sturz?.aufprallV),
      dehnungProzent: zahl(sturz?.dehnungProzent),
      dehnungM: zahl(sturz?.dehnungM),
      ankerkN: zahl(sturz?.ankerkN),
      sichererkN: zahl(sturz?.sichererkN),
      stufe: sturz?.bewertung?.stufe ?? null,
      faktorUngueltig: !!sturz?.faktorUngueltig,
      faktorExtrem: !!sturz?.faktorExtrem,
      ueberUIAA: !!sturz?.ueberUIAA,
      dehnungUnphysikalisch: !!sturz?.dehnungUnphysikalisch,
      durchlaufkN: zahl(dynamik?.durchlauf?.kN),
      schlappkN: zahl(dynamik?.schlapp?.kN),
      fEff: zahl(dynamik?.schlapp?.fEff),
      koerperkN: zahl(dynamik?.koerper?.kN),
      mRed: zahl(dynamik?.koerper?.mRed),
    },
  };
  bestand.tests.push(t);
  bestand.nextNr = nr + 1;
  return t;
}

// Einzel-Löschen: Nummern werden NICHT neu vergeben (nextNr bleibt), damit
// ältere Excel-Exporte eindeutig bleiben.
export function testEntfernen(bestand, nr) {
  bestand.tests = bestand.tests.filter((t) => t.nr !== nr);
  return bestand;
}

// „Alle löschen": leeres Protokoll startet wieder bei Test 1.
export function alleEntfernen() {
  return neuerBestand();
}

// Flags -> Hinweis-Text für die Excel-Spalte (und ggf. Fehlersuche im Nachgang).
export function hinweise(erg = {}) {
  const teile = [];
  if (erg.faktorUngueltig) teile.push('Seil = 0: kein Fangstoß');
  if (erg.faktorExtrem) teile.push('f > 2');
  if (erg.ueberUIAA) teile.push('über UIAA 12 kN');
  if (erg.dehnungUnphysikalisch) teile.push('Modellgrenze Dehnung');
  return teile.join(' · ');
}

// Testeintrag -> Excel-Zeile, deckungsgleich mit SPALTEN. Zahlen bleiben roh
// (Punktdezimale übernimmt xlsx.mjs); null = leere Zelle.
export function testZuZeile(t) {
  const e = t.eingaben;
  const r = t.ergebnisse;
  const werte = {
    name: t.name,
    zeit: formatZeit(t.zeit),
    m: e.m, h: e.h, L: e.L, M: e.M, uiaa: e.uiaa,
    uiaaOn: e.uiaaOn ? 'ja' : 'nein',
    mEff: e.mEff, c: e.c, s: e.s, delta: e.delta, m0: e.m0,
    fangstosskN: r.fangstosskN, f: r.f, energieJ: r.energieJ, aufprallV: r.aufprallV,
    dehnungProzent: r.dehnungProzent, dehnungM: r.dehnungM,
    ankerkN: r.ankerkN, sichererkN: r.sichererkN, stufe: r.stufe,
    durchlaufkN: r.durchlaufkN, schlappkN: r.schlappkN, fEff: r.fEff,
    koerperkN: r.koerperkN, mRed: r.mRed,
    hinweise: hinweise(r) || null,
  };
  return SPALTEN.map((s) => werte[s.key] ?? null);
}
