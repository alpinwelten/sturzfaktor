// app.js — UI-Wiring für den Sturzfaktor-/Fangstoß-Rechner.
// Live-Recalc bei jeder Eingabe, Slider↔Feld-Sync, Stepper, Modul-Presets,
// optionale Modul-Rückrechnung aus dem UIAA-Fangstoß, Persistenz, PWA-Install.
import {
  computeSturz, computeDynamik, bewertung, rhoAusC,
  modulAusUIAA, MODUL_PRESETS, DEFAULTS,
} from './js/engine.mjs';

const $ = (id) => document.getElementById(id);

// Persistenz: Schlüssel bleibt `sturzfaktor.v1`.
// Migrationspolitik: KEINE Zwangsmigration. Ein Altstand ohne die Part-3-Felder
// (und mit einem älteren gespeicherten c) wird unverändert übernommen — fehlende
// Schlüssel behalten schlicht die Vorgaben aus dem HTML, ein selbst gesetztes c
// bleibt das des Nutzers. Nur Voreinstellung und „Zurücksetzen" liefern c = 0,68.
// SCHEMA dokumentiert den Stand für spätere, dann bewusst zu entscheidende Migrationen.
const STORE = 'sturzfaktor.v1';
const SCHEMA = 2;

// Zuletzt manuell gesetztes Seilmodul – wird beim UIAA-Modus zwischengespeichert
// und beim Zurückschalten wiederhergestellt (statt mit dem abgeleiteten Wert zu überschreiben).
let manualM = String(DEFAULTS.M);

const NUM_FIELDS = ['in-m', 'in-h', 'in-L', 'in-M', 'in-uiaa', 'in-c', 'in-s', 'in-delta', 'in-m0'];
const SLIDERS = ['sl-m', 'sl-h', 'sl-L', 'sl-s', 'sl-delta', 'sl-m0'];

// ---- de-DE-Formatierung -----------------------------------------------------
const fmt = (n, dmin = 0, dmax = 2) =>
  Number(n).toLocaleString('de-DE', { minimumFractionDigits: dmin, maximumFractionDigits: dmax });

// Zahlwert einer Kraft ohne Einheit — Basis für fmtKN und die Von→Zu-Zeile,
// damit „von" und „zu" garantiert gleich formatiert sind.
function fmtWert(kN, hard = 2) {
  if (kN == null || !Number.isFinite(kN)) return '—';
  const d = kN >= 10 ? Math.max(1, hard - 1) : hard;
  return fmt(kN, 1, d);
}
function fmtKN(kN, hard = 2) {
  const t = fmtWert(kN, hard);
  return t === '—' ? '—' : t + ' kN';
}
function fmtEnergie(J) {
  if (!Number.isFinite(J)) return '—';
  if (J < 1000) return fmt(J, 0, 0) + ' J';
  if (J < 1e6) return fmt(J / 1000, 1, 2) + ' kJ';
  return fmt(J / 1e6, 2, 2) + ' MJ';
}

// Wert eines Feldes als Zahl (Komma erlaubt). Leeres/ungültiges Feld -> NaN.
function num(id) {
  const raw = String($(id).value).replace(',', '.').trim();
  if (raw === '') return NaN;
  const v = parseFloat(raw);
  return Number.isFinite(v) ? v : NaN;
}

// ---- Eingaben einsammeln ----------------------------------------------------
function gatherInput() {
  const uiaaOn = $('uiaa-on').checked;
  let M = num('in-M');
  let derivedM = null;

  if (uiaaOn) {
    const mN = modulAusUIAA(num('in-uiaa') * 1000); // UIAA-Fangstoß kN -> N
    derivedM = mN == null ? null : mN / 1000;
    if (derivedM != null) M = derivedM;
  }
  return {
    m: num('in-m'), h: num('in-h'), L: num('in-L'),
    M, c: num('in-c'),
    s: num('in-s'), delta: num('in-delta'), m0: num('in-m0'),
    _uiaaOn: uiaaOn, _derivedM: derivedM,
  };
}

// ---- Rendern ----------------------------------------------------------------
function render(persist = true) {
  const input = gatherInput();
  const r = computeSturz(input);

  // Modul-Rückrechnung: Anzeige + Feld-Steuerung (Feld UND Stepper sperren)
  const dEl = $('uiaa-derived');
  $('in-M').disabled = input._uiaaOn;
  for (const b of document.querySelectorAll('.step[data-target="in-M"]')) b.disabled = input._uiaaOn;
  if (input._uiaaOn) {
    dEl.textContent = input._derivedM != null
      ? `→ Seilmodul ≈ ${fmt(input._derivedM, 1, 1)} kN (wird verwendet)`
      : '→ Wert zu klein für ein gültiges Seilmodul';
    if (input._derivedM != null) $('in-M').value = fmt(input._derivedM, 0, 1).replace(',', '.');
  } else {
    dEl.textContent = '→ Seilmodul ≈ — kN';
  }
  markActivePreset(input._uiaaOn ? null : num('in-M'));

  // Fangstoß (primär) + Ampel
  const stufe = r.bewertung?.klasse ?? null;
  $('r-fangstoss').textContent = r.fangstosskN == null ? '—' : fmt(r.fangstosskN, 1, 2);
  setStufe($('r-big'), stufe);
  const pill = $('r-stufe');
  pill.textContent = r.bewertung?.stufe ?? '—';
  setStufe(pill, stufe);

  const marker = $('gauge-marker');
  if (r.fangstosskN == null) {
    marker.hidden = true;
  } else {
    marker.hidden = false;
    marker.style.left = Math.min(100, Math.max(0, (r.fangstosskN / 16) * 100)) + '%';
  }

  const hint = $('hint-fangstoss');
  if (r.faktorUngueltig) {
    hint.hidden = false; hint.dataset.tone = 'krit';
    hint.textContent = 'Ausgegebenes Seil muss > 0 sein, um Sturzfaktor & Fangstoß zu berechnen.';
  } else if (r.ueberUIAA) {
    hint.hidden = false; hint.dataset.tone = 'krit';
    hint.textContent = 'Über der UIAA-Grenze von 12 kN — kritische Belastung für Seil, Sicherungskette und Körper.';
  } else if (r.f === 0) {
    hint.hidden = false; hint.dataset.tone = 'info';
    hint.textContent = 'Kein freier Fall (f = 0): modellbedingt nähert sich der Fangstoß dem statischen Schockwert 2·m·g, nicht 0.';
  } else {
    hint.hidden = true;
  }

  // Sturzfaktor
  $('r-faktor').textContent = r.f == null ? '—' : fmt(r.f, 2, 2);
  $('r-faktor-badge').hidden = !r.faktorExtrem;
  $('r-faktor-sub').textContent = r.f == null
    ? 'Seil > 0 nötig'
    : `${fmt(r.in.h, 0, 1)} m / ${fmt(r.in.L, 0, 1)} m`;

  // Energie + Geschwindigkeit
  $('r-energie').textContent = fmtEnergie(r.energieJ);
  $('r-energie-sub').textContent = `${fmt(r.energieJ, 0, 0)} J`;
  $('r-v').textContent = fmt(r.aufprallV, 1, 1) + ' m/s';

  // Seildehnung
  if (r.dehnungProzent == null) {
    $('r-dehnung').textContent = '—';
    $('r-dehnung-sub').textContent = 'ε = F / M';
  } else {
    $('r-dehnung').textContent = fmt(r.dehnungProzent, 0, 0) + ' %';
    $('r-dehnung-sub').textContent = fmt(r.dehnungM, 1, 2) + ' m'
      + (r.dehnungUnphysikalisch ? ' · Modellgrenze' : '');
  }

  // Kräfte
  $('r-anker').textContent = fmtKN(r.ankerkN);
  $('r-sicherer').textContent = fmtKN(r.sichererkN);

  // Erweitert: c-Anzeige (inkl. Umrechnung auf den Reibungsparameter ρ = 1/c)
  const c = Number.isFinite(num('in-c')) ? num('in-c') : DEFAULTS.c;
  const rho = rhoAusC(c);
  $('c-val').textContent = fmt(c, 2, 2);
  // Nur die erste, mitlaufende Zeile wird geschrieben; die zweite steht fest im
  // HTML. Beide Zeilen sind einzeilig erzwungen (styles.css .c-note), damit der
  // wechselnde ρ-Wert die Höhe der Notiz nicht verändern kann.
  $('c-note-live').textContent =
    `Anker = ${fmt(1 + c, 2, 2)}·F · ρ = 1/c = ${rho == null ? '∞' : fmt(rho, 2, 2)}`;

  renderDynamik(input, r);

  // Rechnen und Anzeigen laufen bei jedem Tick live mit; nur der Schreibvorgang
  // in den localStorage wartet auf eine kurze Ruhepause (siehe saveSpaeter).
  if (persist) saveSpaeter();
}

// ---- Dynamik-Sektion (Part 3) ----------------------------------------------
function setHint(el, text, tone) {
  if (!text) { el.hidden = true; return; }
  el.hidden = false;
  el.textContent = text;
  if (tone) el.dataset.tone = tone; else el.removeAttribute('data-tone');
}

// Vergleich in Worten für die Trendzeile, wenn die Von→Zu-Darstellung entfällt,
// weil sich der angezeigte Wert nicht sichtbar ändert: „unverändert ggü. 4,41 kN"
// bzw. „−0,1 % ggü. 4,41 kN".
function vergleich(prozent, basiskN) {
  if (prozent == null || basiskN == null) return '';
  if (Math.abs(prozent) < 0.05) return `unverändert ggü. ${fmt(basiskN, 1, 2)} kN`;
  const vz = prozent > 0 ? '+' : '−';
  return `${vz}${fmt(Math.abs(prozent), 1, 1)} % ggü. ${fmt(basiskN, 1, 2)} kN`;
}

function setWert(valId, text) {
  $(valId).querySelector('.dd-neu').textContent = text;
}

function setErgebnis(valId, pillId, kN) {
  setWert(valId, fmtKN(kN));
  const note = bewertung(kN);
  const pill = $(pillId);
  pill.textContent = note?.stufe ?? '—';
  setStufe(pill, note?.klasse ?? null);
}

// Platzhalter statt Entfernen: Der Platz der Von→Zu-/Trendzeile bleibt auch im
// inaktiven Zustand reserviert (CSS: [data-leer] -> visibility: hidden), sonst
// wächst der Ergebnis-Kasten beim Übergang 0 ↔ 0,05 um eine Zeile und die Seite
// ruckt unter dem ziehenden Finger weg. Reserviert wird nur der Platz — der
// Inhalt bleibt leer, ein „4,41 → 4,41" entsteht dadurch nie.
function leerLassen(el) {
  el.textContent = '';
  el.dataset.leer = '';
}
function fuellen(el, text) {
  el.textContent = text;
  delete el.dataset.leer;
}

// Von→Zu-Darstellung „4,41 → 3,56 kN" plus Richtungspfeil und Prozentangabe.
// Gezeigt nur bei wirklich aktivem Effekt UND sichtbar anderem Wert — nie „4,41 → 4,41".
// Der Von-Wert ist der aktuelle Basis-Fangstoß von oben und läuft live mit.
// Greift der Effekt, ohne den ANGEZEIGTEN Wert zu verändern, trägt dieselbe
// reservierte Zeile den Vergleich in Worten („unverändert ggü. 4,41 kN").
// Früher hing dieser Satz an der Formel-Unterzeile — dort brach er auf 360 px
// um und ließ den Kasten um eine Zeile wachsen. Beides steht nie gleichzeitig.
// Die Trendzeile ist bewusst kurz („ggü." wie in vergleich() oben): Sie muss auf
// 360 px Breite auch mit dreistelligem Prozentwert EINzeilig bleiben, sonst
// wechselt die Höhe des Ergebnis-Kastens an jeder Ziffergrenze (−9,x ↔ −10,x %)
// und die Seite ruckt unter dem ziehenden Finger weg. Der Bezug bleibt beim
// Wort: verglichen wird mit dem Fangstoß oben. Messwerte: siehe .dyn-trend
// in styles.css — jede Verlängerung des Texts muss dort nachgemessen werden.
function setVonZu(valId, trendId, { aktiv, basiskN, kN, prozent }) {
  const von = $(valId).querySelector('.dd-von');
  const trend = $(trendId);
  const vonTxt = fmtWert(basiskN);
  const zuTxt = fmtWert(kN);
  const zeigen = !!aktiv && vonTxt !== '—' && zuTxt !== '—' && vonTxt !== zuTxt
    && prozent != null && Number.isFinite(prozent);

  leerLassen(von);
  trend.removeAttribute('data-richtung');

  if (!zeigen) {
    // Ohne sichtbaren Wertunterschied kein „4,41 → 4,41": Die Von-Zahl bleibt
    // leer, die Trendzeile nennt den Vergleich nur, wenn der Effekt läuft.
    const ersatz = aktiv ? vergleich(prozent, basiskN) : '';
    if (ersatz) fuellen(trend, ersatz); else leerLassen(trend);
    return;
  }
  fuellen(von, `${vonTxt} → `);                       // U+2192, Trennabstand als Leerzeichen
  const ab = prozent < 0;
  trend.dataset.richtung = ab ? 'ab' : 'auf';         // ab -> --gut, auf -> --hoch
  fuellen(trend, `${ab ? '↓' : '↑'} ${ab ? '−' : '+'}` // U+2193 / U+2191 / U+2212
    + `${fmt(Math.abs(prozent), 1, 1)} % ggü. Fangstoß oben`);
}

// Kompakte Zustandszeile für die eingeklappte Karte: aktive Effekte oder „aus".
function dynZustand(d) {
  const teile = [];
  if (d.in.s > 0) teile.push(`s ${fmt(d.in.s, 0, 2)} m`);
  if (d.in.delta > 0) teile.push(`δ ${fmt(d.in.delta, 0, 2)} m`);
  if (d.in.m0 > 0) teile.push(`m₀ ${fmt(d.in.m0, 0, 0)} kg`);
  return teile.length ? teile.join(' · ') : 'aus';
}

// Der Zustandstext steht ÜBER den Reglern. Würde er beim Ziehen mitlaufen,
// könnte jede Änderung oberhalb des Fingers die Seite verschieben — genau das
// war der gemeldete Effekt („das ganze Bild vibriert"). Deshalb:
// Bei offener Schublade wird er gar nicht mehr fortgeschrieben (und ist per CSS
// ausgeblendet, weil derselbe Zustand dann ausführlich darunter steht).
// Geschrieben wird nur bei geschlossener Karte und einmal beim Zuklappen.
let dynZustandText = 'aus';
function setDynZustand(text) {
  dynZustandText = text;
  if (!$('disc-dyn').open) $('dyn-state').textContent = text;
}

function renderDynamik(input, basis) {
  const d = computeDynamik(input);
  const b = d.basiskN;

  setDynZustand(dynZustand(d));

  // --- Seildurchlauf (Gl. 6.10) ---
  setErgebnis('r-dl', 'r-dl-stufe', d.durchlauf.kN);
  setVonZu('r-dl', 'r-dl-trend', {
    aktiv: d.in.s > 0, basiskN: b, kN: d.durchlauf.kN, prozent: d.durchlauf.aenderungProzent,
  });
  // Unterzeile trägt nur Rechengrößen — der Vergleich steht in der Trendzeile.
  // Die Sättigungslänge steht hier und NICHT im Hinweistext darunter: Der Hinweis
  // ist ein umbrechender Fließtext, dessen Zeilenzahl mit der Stellenzahl der Zahl
  // kippen würde. Diese Unterzeile ist einzeilig erzwungen und damit höhenfest.
  $('r-dl-sub').textContent = d.in.s <= 0
    ? 's = 0 m · unverändert'
    : `s = ${fmt(d.in.s, 1, 2)} m`
      + (d.durchlauf.gesaettigt && d.durchlauf.sMin != null
        ? ` · Optimum ab ${fmt(d.durchlauf.sMin, 1, 2)} m` : '');
  // Optimum-Kennzeichnung nur zeigen, wenn wirklich Durchlauf gerechnet wird;
  // bei s > 0 ist sie Pflicht (Fig. 7-9: reale Bremsgeräte erreichen die Kurve nicht).
  $('dl-optimum').hidden = !(d.in.s > 0);

  if (basis.faktorUngueltig) {
    setHint($('dl-hint'), 'Ausgegebenes Seil muss > 0 sein.', 'krit');
  } else if (d.durchlauf.ueberGueltigkeit) {
    setHint($('dl-hint'), 'Über 1 m Durchlauf: Gl. 6.10 ist nur bis s = 1 m ausgewiesen, und laut '
      + 'Paper (S. 22) tritt darüber keine nennenswerte zusätzliche Reduktion mehr ein. '
      + 'Angezeigt wird deshalb der Wert bei s = 1 m.', null);
  } else if (d.durchlauf.gesaettigt && d.durchlauf.sMin != null) {
    // Bewusst ohne Zahlwert: Der Text darf sich pro Regler-Tick nicht ändern,
    // sonst kippt seine Zeilenzahl. Die Länge steht in der Unterzeile oben.
    setHint($('dl-hint'), 'Rechnerisches Optimum bereits erreicht – mehr Durchlauf senkt '
      + 'den Fangstoß in diesem Modell nicht weiter.', 'info');
  } else {
    setHint($('dl-hint'), null);
  }

  // --- Schlappseil (Gl. 6.12) ---
  setErgebnis('r-sl', 'r-sl-stufe', d.schlapp.kN);
  setVonZu('r-sl', 'r-sl-trend', {
    aktiv: d.schlapp.aktiv && d.schlapp.fEff != null,
    basiskN: b, kN: d.schlapp.kN, prozent: d.schlapp.aenderungProzent,
  });
  $('r-sl-sub').textContent = !d.schlapp.aktiv || d.schlapp.fEff == null
    ? 'δ = 0 m · unverändert'
    : `f_eff = ${fmt(d.schlapp.fEff, 2, 2)} · δ/L = ${fmt(d.schlapp.deltaProL, 2, 2)}`;

  if (!d.schlapp.aktiv || d.f == null) {
    setHint($('sl-hint'), null);
  } else if (d.schlapp.erhoehtFangstoss) {
    setHint($('sl-hint'), 'Sturzfaktor unter 1: Schlappseil ERHÖHT hier den Fangstoß – '
      + 'in Halle und Klettergarten also vermeiden (Part 3, S. 21).', null);
  } else {
    setHint($('sl-hint'), 'Sturzfaktor ab 1: rechnerisch senkt Schlappseil den Fangstoß – '
      + 'in Einseillängen-Routen ist f > 1 aber gar nicht möglich (Part 3, S. 21).', 'info');
  }

  // --- Körpersicherung (S. 21) ---
  if (!d.koerper.aktiv) {
    setWert('r-ks', '—');
    setVonZu('r-ks', 'r-ks-trend', { aktiv: false });
    const pill = $('r-ks-stufe');
    pill.textContent = 'aus';
    setStufe(pill, null);
    $('r-ks-sub').textContent = 'm₀ = 0 · Sicherung am fixen Punkt';
    setHint($('ks-hint'), null);
  } else {
    setErgebnis('r-ks', 'r-ks-stufe', d.koerper.kN);
    setVonZu('r-ks', 'r-ks-trend', {
      aktiv: true, basiskN: b, kN: d.koerper.kN, prozent: d.koerper.aenderungProzent,
    });
    $('r-ks-sub').textContent = `m_red = ${fmt(d.koerper.mRed, 1, 1)} kg`;
    setHint($('ks-hint'), d.koerper.guenstiger
      ? null
      : 'Modellgrenze: das Näherungsmodell rechnet mit 2·g statt g und liegt für sehr große m₀ '
        + 'über der Fixpunkt-Formel – dort ist der Vergleich nicht mehr aussagekräftig.', 'info');
  }
}

function setStufe(el, klasse) {
  if (klasse) el.dataset.stufe = klasse; else el.removeAttribute('data-stufe');
}

function markActivePreset(M) {
  const presets = MODUL_PRESETS;
  for (const btn of document.querySelectorAll('#modul-presets .chip')) {
    const v = presets[btn.dataset.modul];
    btn.setAttribute('aria-pressed', String(M != null && Math.abs(M - v) < 1e-9));
  }
}

// ---- Persistenz -------------------------------------------------------------
// Schreiben ist vom Ziehen entkoppelt: Ein Reglerzug feuert dutzende
// input-Events pro Sekunde, jedes davon würde sonst ein synchrones
// localStorage.setItem samt JSON.stringify auslösen — auf dem iPhone genug
// Hauptthread-Zeit, um die Zieh-Geste stocken zu lassen. Trailing-Debounce:
// gespeichert wird erst nach einer kurzen Ruhepause.
const SAVE_DEBOUNCE_MS = 200;
let saveTimer = null;

function save() {
  try {
    const data = { schema: SCHEMA, uiaaOn: $('uiaa-on').checked };
    for (const id of NUM_FIELDS) data[id] = $(id).value;
    localStorage.setItem(STORE, JSON.stringify(data));
  } catch { /* Speicher blockiert -> egal */ }
}
// Verzögert speichern; jeder neue Tick verschiebt den Termin nach hinten.
function saveSpaeter() {
  if (saveTimer != null) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveTimer = null; save(); }, SAVE_DEBOUNCE_MS);
}
// Sofort speichern und einen offenen Debounce verwerfen. Für Abschlüsse:
// Zieh-Ende (change), „Zurücksetzen".
function saveJetzt() {
  if (saveTimer != null) { clearTimeout(saveTimer); saveTimer = null; }
  save();
}
// Nur nachziehen, wenn wirklich etwas aussteht — für App-Verlassen/Tabwechsel,
// damit ein Wechsel mitten im Debounce-Fenster keine Eingabe verliert.
function saveFlush() {
  if (saveTimer != null) saveJetzt();
}
function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORE) || '{}');
    if (typeof data.uiaaOn === 'boolean') $('uiaa-on').checked = data.uiaaOn;
    for (const id of NUM_FIELDS) if (data[id] != null && $(id)) $(id).value = data[id];
  } catch { /* defekt -> Defaults */ }
  // Manuelles Modul aus dem geladenen Zustand übernehmen (für UIAA-Umschaltung)
  manualM = $('in-M').value || String(DEFAULTS.M);
}

// Auf/Zu der Dynamik-Karte wird NICHT gespeichert, sondern aus der Aktivität
// abgeleitet: Wer mit gesetztem s, δ oder m₀ zurückkommt, sieht die Karte offen.
function oeffneDynamikWennAktiv() {
  if (num('in-s') > 0 || num('in-delta') > 0 || num('in-m0') > 0) $('disc-dyn').open = true;
}

// ---- Slider ↔ Feld ----------------------------------------------------------
function syncSlidersFromFields() {
  for (const sid of SLIDERS) {
    const sl = $(sid);
    const target = $(sl.dataset.target);
    const v = num(sl.dataset.target);
    if (Number.isFinite(v)) sl.value = Math.min(Number(sl.max), Math.max(Number(sl.min), v));
    void target;
  }
}

// ---- Stepper ----------------------------------------------------------------
function applyStep(targetId, delta) {
  const el = $(targetId);
  const cur = Number.isFinite(num(targetId)) ? num(targetId) : 0;
  const min = el.min !== '' ? Number(el.min) : -Infinity;
  const max = el.max !== '' ? Number(el.max) : Infinity;
  let next = Math.min(max, Math.max(min, cur + delta));
  // Saubere Dezimalstellen (Gleitkomma-Rauschen vermeiden)
  next = Math.round(next * 1000) / 1000;
  el.value = String(next);
}

// ---- Defaults ---------------------------------------------------------------
function resetDefaults() {
  $('in-m').value = DEFAULTS.m;
  $('in-h').value = DEFAULTS.h;
  $('in-L').value = DEFAULTS.L;
  $('in-M').value = DEFAULTS.M;
  $('in-uiaa').value = DEFAULTS.uiaa;
  $('in-c').value = DEFAULTS.c;
  $('in-s').value = DEFAULTS.s;
  $('in-delta').value = DEFAULTS.delta;
  $('in-m0').value = DEFAULTS.m0;
  $('uiaa-on').checked = false;
  manualM = String(DEFAULTS.M);
  syncSlidersFromFields();
  render(false);
  saveJetzt();   // Zurücksetzen ist ein Abschluss – sofort in den Speicher
}

// ---- Verdrahtung ------------------------------------------------------------
function wire() {
  // Zahlenfelder. `change` (Feld verlassen, Enter, Zieh-Ende am c-Regler) ist
  // der Abschluss-Save und beendet ein offenes Debounce-Fenster.
  for (const id of NUM_FIELDS) {
    $(id).addEventListener('input', () => { syncSlidersFromFields(); render(); });
    $(id).addEventListener('change', () => saveJetzt());
  }
  // Slider -> Feld. `change` feuert am Ende der Zieh-Geste – genau dort wird
  // der beim Ziehen aufgeschobene Zustand endgültig geschrieben.
  for (const sid of SLIDERS) {
    $(sid).addEventListener('input', () => {
      const tgt = $(sid).dataset.target;
      $(tgt).value = $(sid).value;
      render();
    });
    $(sid).addEventListener('change', () => saveJetzt());
  }
  // Stepper
  for (const btn of document.querySelectorAll('.step')) {
    btn.addEventListener('click', () => {
      applyStep(btn.dataset.target, parseFloat(btn.dataset.step));
      syncSlidersFromFields();
      render();
    });
  }
  // Presets
  for (const btn of document.querySelectorAll('#modul-presets .chip')) {
    btn.addEventListener('click', () => {
      $('uiaa-on').checked = false;
      $('in-M').disabled = false;
      $('in-M').value = MODUL_PRESETS[btn.dataset.modul];
      manualM = $('in-M').value;
      render();
    });
  }
  // UIAA-Toggle: manuellen Modulwert merken / wiederherstellen
  $('uiaa-on').addEventListener('change', () => {
    if ($('uiaa-on').checked) { manualM = $('in-M').value; $('disc-uiaa').open = true; }
    else { $('in-M').value = manualM; }
    render(false);
    saveJetzt();
  });
  // Reset
  $('btn-reset').addEventListener('click', resetDefaults);

  // Zuklappen: Der beim Ziehen zurückgehaltene Zustand wird jetzt nachgetragen.
  // (Kein Neurechnen nötig — der Text der letzten Berechnung liegt bereit.)
  $('disc-dyn').addEventListener('toggle', () => {
    if (!$('disc-dyn').open) $('dyn-state').textContent = dynZustandText;
  });

  // App verlassen / Tab wechseln: ausstehenden Debounce nachziehen. Auf iOS ist
  // `visibilitychange` → hidden das letzte verlässliche Signal (pagehide als
  // Rückfall für ältere WebKit-Stände); unload feuert dort nicht zuverlässig.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveFlush();
  });
  window.addEventListener('pagehide', () => saveFlush());
}

// ---- PWA --------------------------------------------------------------------
function pwa() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
  let deferred = null;
  const btn = $('btn-install');
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); deferred = e; btn.hidden = false;
  });
  btn.addEventListener('click', async () => {
    if (!deferred) return;
    deferred.prompt(); await deferred.userChoice; deferred = null; btn.hidden = true;
  });
  window.addEventListener('appinstalled', () => { btn.hidden = true; });
}

// ---- Start ------------------------------------------------------------------
load();
syncSlidersFromFields();
oeffneDynamikWennAktiv();
wire();
pwa();
render(false); // Init: noch nicht persistieren – Store erst nach echter Interaktion schreiben
