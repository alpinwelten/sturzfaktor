import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crc32, escXml, spaltenName, erzeugeZip, erzeugeXlsx } from '../js/xlsx.mjs';

const enc = new TextEncoder();
const FIX_DATUM = new Date(2026, 7, 19, 14, 32); // 19.08.2026 14:32 -> DOS 23827 / 29696

// ---------- CRC-32 ----------
test('crc32: Norm-Prüfvektoren', () => {
  assert.equal(crc32(enc.encode('')), 0x00000000);
  assert.equal(crc32(enc.encode('a')), 0xE8B7BE43);
  assert.equal(crc32(enc.encode('abc')), 0x352441C2);
  assert.equal(crc32(enc.encode('123456789')), 0xCBF43926); // Check-Value der Norm
  assert.equal(crc32(enc.encode('The quick brown fox jumps over the lazy dog')), 0x414FA339);
});

// ---------- XML-Escaping ----------
test('escXml: die fünf Spezialzeichen, & zuerst', () => {
  assert.equal(escXml(`&<>"'`), '&amp;&lt;&gt;&quot;&apos;');
});
test('escXml: Umlaute und Sonderzeichen bleiben roh (UTF-8)', () => {
  assert.equal(escXml('äöüß · Test'), 'äöüß · Test');
});

// ---------- Spaltennamen ----------
test('spaltenName: A..Z, AA.., AAA..', () => {
  assert.equal(spaltenName(0), 'A');
  assert.equal(spaltenName(25), 'Z');
  assert.equal(spaltenName(26), 'AA');
  assert.equal(spaltenName(27), 'AB');
  assert.equal(spaltenName(51), 'AZ');
  assert.equal(spaltenName(52), 'BA');
  assert.equal(spaltenName(701), 'ZZ');
  assert.equal(spaltenName(702), 'AAA');
});

// ---------- ZIP: Einzeleintrag byteweise ----------
test('erzeugeZip: Einzeleintrag — Header, CRC, Größen, EOCD', () => {
  const bytes = erzeugeZip([{ name: 'test.txt', text: 'hallo' }], FIX_DATUM);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const td = new TextDecoder();

  // Gesamtlänge: Local(30+8)+Daten(5) + Central(46+8) + EOCD(22)
  assert.equal(bytes.length, 30 + 8 + 5 + 46 + 8 + 22);

  // Local File Header
  assert.equal(dv.getUint32(0, true), 0x04034B50);
  assert.equal(dv.getUint16(4, true), 20);          // version needed
  assert.equal(dv.getUint16(6, true), 0);           // flags
  assert.equal(dv.getUint16(8, true), 0);           // method = stored
  assert.equal(dv.getUint16(10, true), 29696);      // DOS-Zeit 14:32:00
  assert.equal(dv.getUint16(12, true), 23827);      // DOS-Datum 19.08.2026
  assert.equal(dv.getUint32(14, true), crc32(enc.encode('hallo')));
  assert.equal(dv.getUint32(18, true), 5);          // compressed
  assert.equal(dv.getUint32(22, true), 5);          // uncompressed
  assert.equal(dv.getUint16(26, true), 8);          // nameLen
  assert.equal(dv.getUint16(28, true), 0);          // extraLen
  assert.equal(td.decode(bytes.subarray(30, 38)), 'test.txt');
  assert.equal(td.decode(bytes.subarray(38, 43)), 'hallo');

  // EOCD
  const eocd = bytes.length - 22;
  assert.equal(dv.getUint32(eocd, true), 0x06054B50);
  assert.equal(dv.getUint16(eocd + 8, true), 1);    // Einträge (diese Disk)
  assert.equal(dv.getUint16(eocd + 10, true), 1);   // Einträge gesamt
  assert.equal(dv.getUint32(eocd + 12, true), 46 + 8); // CD-Größe
  assert.equal(dv.getUint32(eocd + 16, true), 43);  // CD-Offset

  // Central Directory
  assert.equal(dv.getUint32(43, true), 0x02014B50);
  assert.equal(dv.getUint32(43 + 42, true), 0);     // Local-Header-Offset
  assert.equal(td.decode(bytes.subarray(43 + 46, 43 + 46 + 8)), 'test.txt');
});

// ---------- ZIP: Multi-Eintrag-Offsets ----------
test('erzeugeZip: drei Einträge — EOCD -> CD -> Local-Offsets konsistent', () => {
  const eintraege = [
    { name: 'a.xml', text: 'eins' },
    { name: 'ordner/b.xml', text: 'zwei zwei' },
    { name: 'ordner/tief/c.xml', text: 'drei drei drei' },
  ];
  const bytes = erzeugeZip(eintraege, FIX_DATUM);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const td = new TextDecoder();

  const eocd = bytes.length - 22;
  assert.equal(dv.getUint32(eocd, true), 0x06054B50);
  assert.equal(dv.getUint16(eocd + 10, true), 3);
  const cdGroesse = dv.getUint32(eocd + 12, true);
  let cd = dv.getUint32(eocd + 16, true);
  assert.equal(cd + cdGroesse, eocd); // CD endet direkt vor EOCD

  let summe = 0;
  for (const e of eintraege) {
    assert.equal(dv.getUint32(cd, true), 0x02014B50);
    const nameLen = dv.getUint16(cd + 28, true);
    const lokalOffset = dv.getUint32(cd + 42, true);
    const name = td.decode(bytes.subarray(cd + 46, cd + 46 + nameLen));
    assert.equal(name, e.name);
    // Am notierten Offset steht der Local Header mit demselben Namen
    assert.equal(dv.getUint32(lokalOffset, true), 0x04034B50);
    const lokalNameLen = dv.getUint16(lokalOffset + 26, true);
    assert.equal(td.decode(bytes.subarray(lokalOffset + 30, lokalOffset + 30 + lokalNameLen)), e.name);
    // Größen-Round-Trip: uncompressed size == echte Textlänge
    assert.equal(dv.getUint32(lokalOffset + 22, true), enc.encode(e.text).length);
    summe += 46 + nameLen;
    cd += 46 + nameLen;
  }
  assert.equal(cdGroesse, summe);
});

// ---------- XLSX: Paketinhalt ----------
test('erzeugeXlsx: alle sechs Teile vorhanden, kein sharedStrings', () => {
  const bytes = erzeugeXlsx({
    blattName: 'Testprotokoll',
    kopf: ['Name', 'Wert'],
    zeilen: [['Test 1', 4.41]],
    datum: FIX_DATUM,
  });
  const text = new TextDecoder().decode(bytes);
  for (const teil of [
    '[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml',
    'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml',
  ]) assert.ok(text.includes(teil), `fehlt: ${teil}`);
  assert.ok(!text.includes('sharedStrings'));
  assert.ok(text.includes('<sheet name="Testprotokoll" sheetId="1" r:id="rId1"/>'));
});

test('erzeugeXlsx: Zellen — Kopf fett, Zahlen roh, Strings escaped, null fehlt', () => {
  const bytes = erzeugeXlsx({
    blattName: 'T',
    kopf: ['Name', 'Wert'],
    zeilen: [['Test 1', 4.41], ['ä<&>', null], [0.5, -3]],
    datum: FIX_DATUM,
  });
  const text = new TextDecoder().decode(bytes);
  assert.ok(text.includes('<dimension ref="A1:B4"/>'));
  assert.ok(text.includes('<c r="A1" s="1" t="inlineStr"><is><t>Name</t></is></c>'));
  assert.ok(text.includes('<c r="B1" s="1" t="inlineStr"><is><t>Wert</t></is></c>'));
  assert.ok(text.includes('<c r="A2" t="inlineStr"><is><t>Test 1</t></is></c>'));
  assert.ok(text.includes('<c r="B2"><v>4.41</v></c>'));       // Punktdezimale, roh
  assert.ok(text.includes('<c r="A3" t="inlineStr"><is><t>ä&lt;&amp;&gt;</t></is></c>'));
  assert.ok(!text.includes('r="B3"'));                          // null -> Zelle weggelassen
  assert.ok(text.includes('<c r="A4"><v>0.5</v></c>'));
  assert.ok(text.includes('<c r="B4"><v>-3</v></c>'));
});

test('erzeugeXlsx: styles.xml vollständig (gray125-Füllung, Fett-Stil)', () => {
  const bytes = erzeugeXlsx({ kopf: ['A'], zeilen: [], datum: FIX_DATUM });
  const text = new TextDecoder().decode(bytes);
  assert.ok(text.includes('patternType="gray125"'));            // Excel-Reparatur-Falle
  assert.ok(text.includes('<fonts count="2">'));
  assert.ok(text.includes('<cellXfs count="2">'));
  assert.ok(text.includes('applyFont="1"'));
  // Default-Zellstil („Normal", builtinId 0) — ohne ihn warnt openpyxl
  assert.ok(text.includes('<cellStyles count="1">'));
  assert.ok(text.includes('builtinId="0"'));
});

test('erzeugeXlsx: NaN/Infinity/undefined werden wie null weggelassen', () => {
  const bytes = erzeugeXlsx({
    kopf: ['A', 'B', 'C'],
    zeilen: [[NaN, Infinity, undefined]],
    datum: FIX_DATUM,
  });
  const text = new TextDecoder().decode(bytes);
  assert.ok(text.includes('<row r="2"></row>'));
  assert.ok(!text.includes('NaN') && !text.includes('Infinity'));
});
