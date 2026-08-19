// xlsx.mjs — Minimaler XLSX-Writer: SpreadsheetML im OPC-ZIP, Methode 0 (stored,
// keine Kompression). DOM-frei, läuft in Browser und Node (TextEncoder/DataView).
// Inline-Strings statt sharedStrings; Zahlen roh mit Punktdezimale — Excel
// lokalisiert die Anzeige selbst (deutsches Excel zeigt Kommas).

// ---- CRC-32 (Polynom reflektiert 0xEDB88320, Init/XOR 0xFFFFFFFF) ------------
const CRC_TABELLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABELLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// ---- XML-Escaping (& zuerst; dynamischer Text nur in <t>-Knoten + Sheetname) --
export function escXml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

// ---- Spaltenname: 0 -> A, 25 -> Z, 26 -> AA, 702 -> AAA ----------------------
export function spaltenName(i) {
  let name = '';
  for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) {
    name = String.fromCharCode(65 + (n % 26)) + name;
  }
  return name;
}

// ---- DOS-Zeitstempel für ZIP-Header ------------------------------------------
function dosZeit(d) {
  return ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF;
}
function dosDatum(d) {
  const jahr = Math.max(1980, d.getFullYear()); // DOS kennt nichts vor 1980
  return (((jahr - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
}

// ---- ZIP, Methode 0: Local Headers + Central Directory + EOCD ----------------
// eintraege: [{ name, text }] -> Uint8Array. Alles Little-Endian.
export function erzeugeZip(eintraege, datum = new Date()) {
  const enc = new TextEncoder();
  const zeit = dosZeit(datum);
  const tag = dosDatum(datum);
  const teile = eintraege.map((e) => {
    const nameB = enc.encode(e.name);
    const dataB = enc.encode(e.text);
    return { nameB, dataB, crc: crc32(dataB), offset: 0 };
  });

  const lokalGroesse = teile.reduce((s, t) => s + 30 + t.nameB.length + t.dataB.length, 0);
  const cdGroesse = teile.reduce((s, t) => s + 46 + t.nameB.length, 0);
  const out = new Uint8Array(lokalGroesse + cdGroesse + 22);
  const dv = new DataView(out.buffer);
  let pos = 0;

  for (const t of teile) {
    t.offset = pos;
    dv.setUint32(pos, 0x04034B50, true);            // Local-File-Header-Signatur
    dv.setUint16(pos + 4, 20, true);                // version needed
    dv.setUint16(pos + 6, 0, true);                 // flags (Namen sind ASCII)
    dv.setUint16(pos + 8, 0, true);                 // method = stored
    dv.setUint16(pos + 10, zeit, true);
    dv.setUint16(pos + 12, tag, true);
    dv.setUint32(pos + 14, t.crc, true);
    dv.setUint32(pos + 18, t.dataB.length, true);   // compressed
    dv.setUint32(pos + 22, t.dataB.length, true);   // uncompressed (= stored)
    dv.setUint16(pos + 26, t.nameB.length, true);
    dv.setUint16(pos + 28, 0, true);                // extraLen
    out.set(t.nameB, pos + 30);
    out.set(t.dataB, pos + 30 + t.nameB.length);
    pos += 30 + t.nameB.length + t.dataB.length;
  }

  const cdStart = pos;
  for (const t of teile) {
    dv.setUint32(pos, 0x02014B50, true);            // Central-Directory-Signatur
    dv.setUint16(pos + 4, 20, true);                // version made by
    dv.setUint16(pos + 6, 20, true);                // version needed
    dv.setUint16(pos + 8, 0, true);                 // flags
    dv.setUint16(pos + 10, 0, true);                // method
    dv.setUint16(pos + 12, zeit, true);
    dv.setUint16(pos + 14, tag, true);
    dv.setUint32(pos + 16, t.crc, true);
    dv.setUint32(pos + 20, t.dataB.length, true);
    dv.setUint32(pos + 24, t.dataB.length, true);
    dv.setUint16(pos + 28, t.nameB.length, true);
    // Offsets 30–37 (extra/comment/disk/internal attrs) bleiben 0
    dv.setUint32(pos + 38, 0, true);                // external attrs
    dv.setUint32(pos + 42, t.offset, true);         // Offset des Local Headers
    out.set(t.nameB, pos + 46);
    pos += 46 + t.nameB.length;
  }

  dv.setUint32(pos, 0x06054B50, true);              // EOCD-Signatur
  dv.setUint16(pos + 8, teile.length, true);        // Einträge diese Disk
  dv.setUint16(pos + 10, teile.length, true);       // Einträge gesamt
  dv.setUint32(pos + 12, cdGroesse, true);
  dv.setUint32(pos + 16, cdStart, true);
  return out;
}

// ---- SpreadsheetML-Teile ------------------------------------------------------
const PROLOG = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

const CONTENT_TYPES = PROLOG +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
  '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
  '</Types>';

const RELS = PROLOG +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
  '</Relationships>';

const WORKBOOK_RELS = PROLOG +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
  '</Relationships>';

// styles.xml muss, sobald referenziert, VOLLSTÄNDIG sein: alle Sammlungen plus
// fills[1] = gray125 — sonst zeigt Excel den Reparaturdialog. Stil 1 = fett (Kopfzeile).
const STYLES = PROLOG +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border/></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>';

// Eine Zelle. null/undefined/NaN/±Infinity -> weglassen (sparse ist valide).
function zelle(spalte, zeileNr, wert, stilId = 0) {
  const ref = `${spaltenName(spalte)}${zeileNr}`;
  const s = stilId ? ` s="${stilId}"` : '';
  if (typeof wert === 'number') {
    return Number.isFinite(wert) ? `<c r="${ref}"${s}><v>${String(wert)}</v></c>` : '';
  }
  if (typeof wert === 'string') {
    return `<c r="${ref}"${s} t="inlineStr"><is><t>${escXml(wert)}</t></is></c>`;
  }
  return '';
}

// kopf: string[]; zeilen: Array<Array<string|number|null|undefined>> -> Uint8Array
export function erzeugeXlsx({ blattName = 'Tabelle1', kopf = [], zeilen = [], datum = new Date() } = {}) {
  const name = escXml(String(blattName).slice(0, 31)); // Excel-Grenze für Blattnamen
  const breite = Math.max(1, kopf.length, ...zeilen.map((z) => z.length));

  const zeilenXml = [`<row r="1">${kopf.map((t, i) => zelle(i, 1, String(t), 1)).join('')}</row>`];
  zeilen.forEach((z, zi) => {
    const r = zi + 2;
    zeilenXml.push(`<row r="${r}">${z.map((w, i) => zelle(i, r, w)).join('')}</row>`);
  });

  const sheet = PROLOG +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<dimension ref="A1:${spaltenName(breite - 1)}${zeilen.length + 1}"/>` +
    `<sheetData>${zeilenXml.join('')}</sheetData>` +
    '</worksheet>';

  const workbook = PROLOG +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets>` +
    '</workbook>';

  return erzeugeZip([
    { name: '[Content_Types].xml', text: CONTENT_TYPES },
    { name: '_rels/.rels', text: RELS },
    { name: 'xl/workbook.xml', text: workbook },
    { name: 'xl/_rels/workbook.xml.rels', text: WORKBOOK_RELS },
    { name: 'xl/styles.xml', text: STYLES },
    { name: 'xl/worksheets/sheet1.xml', text: sheet },
  ], datum);
}
