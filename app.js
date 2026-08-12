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

function fmtKN(kN, hard = 2) {
  if (kN == null || !Number.isFinite(kN)) return '—';
  const d = kN >= 10 ? Math.max(1, hard - 1) : hard;
  return fmt(kN, 1, d) + ' kN';
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
  $('c-note').textContent =
    `Anker = ${fmt(1 + c, 2, 2)}·F · ρ = 1/c = ${rho == null ? '∞' : fmt(rho, 2, 2)} · reibungsfrei (c=1): 2·F`;

  renderDynamik(input, r);

  if (persist) save();
}

// ---- Dynamik-Sektion (Part 3) ----------------------------------------------
function setHint(el, text, tone) {
  if (!text) { el.hidden = true; return; }
  el.hidden = false;
  el.textContent = text;
  if (tone) el.dataset.tone = tone; else el.removeAttribute('data-tone');
}

// „−9,8 % ggü. 4,41 kN" bzw. „unverändert"
function vergleich(prozent, basiskN) {
  if (prozent == null || basiskN == null) return '';
  if (Math.abs(prozent) < 0.05) return `unverändert ggü. ${fmt(basiskN, 1, 2)} kN`;
  const vz = prozent > 0 ? '+' : '−';
  return `${vz}${fmt(Math.abs(prozent), 1, 1)} % ggü. ${fmt(basiskN, 1, 2)} kN`;
}

function setErgebnis(valId, pillId, kN) {
  $(valId).textContent = fmtKN(kN);
  const note = bewertung(kN);
  const pill = $(pillId);
  pill.textContent = note?.stufe ?? '—';
  setStufe(pill, note?.klasse ?? null);
}

// Kompakte Zustandszeile für die eingeklappte Karte: aktive Effekte oder „aus".
function dynZustand(d) {
  const teile = [];
  if (d.in.s > 0) teile.push(`s ${fmt(d.in.s, 0, 2)} m`);
  if (d.in.delta > 0) teile.push(`δ ${fmt(d.in.delta, 0, 2)} m`);
  if (d.in.m0 > 0) teile.push(`m₀ ${fmt(d.in.m0, 0, 0)} kg`);
  return teile.length ? teile.join(' · ') : 'aus';
}

function renderDynamik(input, basis) {
  const d = computeDynamik(input);
  const b = d.basiskN;

  $('dyn-state').textContent = dynZustand(d);

  // --- Seildurchlauf (Gl. 6.10) ---
  setErgebnis('r-dl', 'r-dl-stufe', d.durchlauf.kN);
  $('r-dl-sub').textContent = d.in.s <= 0
    ? 's = 0 m · unverändert'
    : `s = ${fmt(d.in.s, 1, 2)} m · ${vergleich(d.durchlauf.aenderungProzent, b)}`;
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
    setHint($('dl-hint'), `Rechnerisches Optimum bereits bei ${fmt(d.durchlauf.sMin, 1, 2)} m erreicht – `
      + 'mehr Durchlauf senkt den Fangstoß in diesem Modell nicht weiter.', 'info');
  } else {
    setHint($('dl-hint'), null);
  }

  // --- Schlappseil (Gl. 6.12) ---
  setErgebnis('r-sl', 'r-sl-stufe', d.schlapp.kN);
  $('r-sl-sub').textContent = !d.schlapp.aktiv || d.schlapp.fEff == null
    ? 'δ = 0 m · unverändert'
    : `f_eff = ${fmt(d.schlapp.fEff, 2, 2)} · δ/L = ${fmt(d.schlapp.deltaProL, 2, 2)} · `
      + vergleich(d.schlapp.aenderungProzent, b);

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
    $('r-ks').textContent = '—';
    const pill = $('r-ks-stufe');
    pill.textContent = 'aus';
    setStufe(pill, null);
    $('r-ks-sub').textContent = 'm₀ = 0 · Sicherung am fixen Punkt';
    setHint($('ks-hint'), null);
  } else {
    setErgebnis('r-ks', 'r-ks-stufe', d.koerper.kN);
    $('r-ks-sub').textContent =
      `m_red = ${fmt(d.koerper.mRed, 1, 1)} kg · ${vergleich(d.koerper.aenderungProzent, b)}`;
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
function save() {
  try {
    const data = { schema: SCHEMA, uiaaOn: $('uiaa-on').checked };
    for (const id of NUM_FIELDS) data[id] = $(id).value;
    localStorage.setItem(STORE, JSON.stringify(data));
  } catch { /* Speicher blockiert -> egal */ }
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
  render();
}

// ---- Verdrahtung ------------------------------------------------------------
function wire() {
  // Zahlenfelder
  for (const id of NUM_FIELDS) {
    $(id).addEventListener('input', () => { syncSlidersFromFields(); render(); });
  }
  // Slider -> Feld
  for (const sid of SLIDERS) {
    $(sid).addEventListener('input', () => {
      const tgt = $(sid).dataset.target;
      $(tgt).value = $(sid).value;
      render();
    });
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
    render();
  });
  // Reset
  $('btn-reset').addEventListener('click', resetDefaults);
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
