// Excel export — the same rows as the CSV, as a workbook.
//
// No dependency. An .xlsx is a ZIP of six small XML parts, and a ZIP that STORES its entries
// (method 0, no compression) is a local header, the bytes and a CRC-32 per entry, then a central
// directory: a hundred lines, not a library. The files are a few hundred KB at the most a grid
// exports, so compressing them is not worth a deflate implementation.
//
// What the workbook adds over the CSV is TYPES: a number stays a number a spreadsheet can sum, and
// a date is a date it can sort. Everything else goes through the column's `format`, as in the CSV,
// so a stored code exports as the label on screen.

import { readPath, type CsvColumn } from './csv';

/** A column for the workbook: the CSV's, read the same way. */
export type XlsxColumn = CsvColumn;

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Style indexes in `styles.xml`'s `cellXfs`: plain, the header's bold, a date. */
const STYLE_HEADER = 1;
const STYLE_DATE = 2;

/** `YYYY-MM-DD`, optionally with a time: a date as the stores keep one. */
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:T[\d:.]+Z?)?$/;

/** Days since 1899-12-30: the 1900 date system every spreadsheet reads, midnight UTC. */
function serial(d: Date): number {
    return Math.round(d.getTime() / 86_400_000) + 25569;
}

/** Text as XML may carry it: escaped, and without the control characters XML 1.0 forbids. */
function xmlText(text: string): string {
    // The characters below 0x20 that XML 1.0 excludes — all but tab, line feed and carriage return.
    // A code comparison and not a regex of control characters, which the linter rightly distrusts.
    let kept = '';
    for (const ch of text) {
        const code = ch.charCodeAt(0);
        if (code >= 0x20 || code === 0x09 || code === 0x0A || code === 0x0D) kept += ch;
    }
    return kept.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** A1-style column letters: 0 → A, 25 → Z, 26 → AA. */
function columnName(index: number): string {
    let name = '';
    for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
    return name;
}

/**
 * One cell. A value starting with `=` is written as an inline STRING: no `<f>` is ever emitted, so
 * the workbook cannot carry a formula — the guard `csvCell` has against formula injection, here by
 * construction rather than by an apostrophe.
 */
function cell(ref: string, raw: unknown, shown: unknown, style = 0): string {
    const s = style ? ` s="${style}"` : '';
    if (typeof raw === 'number' && Number.isFinite(raw)) return `<c r="${ref}" t="n"${s}><v>${raw}</v></c>`;
    const date = raw instanceof Date ? raw
        : typeof raw === 'string' && ISO_DATE.test(raw) ? new Date(raw.length === 10 ? raw + 'T00:00:00Z' : raw) : null;
    if (date && !Number.isNaN(date.getTime())) return `<c r="${ref}" s="${STYLE_DATE}"><v>${serial(date)}</v></c>`;
    if (shown === null || shown === undefined || shown === '') return '';
    const text = xmlText(String(shown));
    // Leading or trailing blanks are kept only with xml:space="preserve".
    const space = /^\s|\s$/.test(text) ? ' xml:space="preserve"' : '';
    return `<c r="${ref}" t="inlineStr"${s}><is><t${space}>${text}</t></is></c>`;
}

/** A date in the short-date format is at most ten characters; the width leaves room for it. */
const DATE_WIDTH = 12;

function sheetXml(rows: readonly Record<string, unknown>[], columns: readonly XlsxColumn[]): string {
    // The longest thing each column holds, in characters: what its width is made from. Found
    // opening the file in Excel — at the default width a date reads «########».
    const longest = columns.map((c) => String(c.header ?? c.field).length);
    const hasDate = columns.map(() => false);

    const header = columns.map((c, i) => cell(`${columnName(i)}1`, undefined, c.header ?? c.field, STYLE_HEADER)).join('');
    const body = rows.map((row, r) => {
        const cells = columns.map((col, i) => {
            const raw = readPath(row, col.field);
            // A typed value is written as its type; the format is for what becomes text.
            const isDate = raw instanceof Date || (typeof raw === 'string' && ISO_DATE.test(raw));
            const typed = typeof raw === 'number' || isDate;
            const shown = col.format ? col.format(raw, row) : raw;
            if (isDate) hasDate[i] = true;
            else longest[i] = Math.max(longest[i], String(typed ? raw : (shown ?? '')).length);
            return cell(`${columnName(i)}${r + 2}`, typed ? raw : undefined, shown);
        }).join('');
        return `<row r="${r + 2}">${cells}</row>`;
    }).join('');

    // Two characters of margin, never narrower than a date where one is, never a whole screen wide.
    const cols = columns.map((_, i) => {
        const width = Math.min(60, Math.max(hasDate[i] ? DATE_WIDTH : 8, longest[i] + 2));
        return `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`;
    }).join('');

    // `<cols>` BEFORE `<sheetData>`: the schema fixes the order, and Excel repairs a file that breaks it.
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        + (columns.length ? `<cols>${cols}</cols>` : '')
        + `<sheetData><row r="1">${header}</row>${body}</sheetData></worksheet>`;
}

const PARTS_FIXED: Record<string, string> = {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        + '<Default Extension="xml" ContentType="application/xml"/>'
        + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        + '</Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        + '</Relationships>',
    'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        + '<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
        + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
        + '</Relationships>',
    // Two fonts (plain, bold), the two fills a stylesheet must have, one border, and three cell
    // formats: plain, bold for the header, and number format 14 — the built-in short date, which a
    // spreadsheet shows in its reader's own locale.
    'xl/styles.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
        + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
        + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
        + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        + '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
        + '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
        + '<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>'
        + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
        + '</styleSheet>',
};

/** The CRC-32 (IEEE) table, computed once. */
let crcTable: Uint32Array | null = null;
function crc32(data: Uint8Array): number {
    if (!crcTable) {
        crcTable = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
            crcTable[n] = c >>> 0;
        }
    }
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) crc = crcTable[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

/**
 * The entries, as a stored ZIP. Every entry's time is the DOS epoch (1980-01-01): the date says
 * nothing about the data, and a fixed one makes the same rows give the same bytes.
 */
function zipStored(entries: [string, Uint8Array][]): Uint8Array<ArrayBuffer> {
    const encoder = new TextEncoder();
    const DOS_DATE = (0 << 9) | (1 << 5) | 1;
    const locals: Uint8Array[] = [];
    const centrals: Uint8Array[] = [];
    let offset = 0;
    for (const [name, data] of entries) {
        const nameBytes = encoder.encode(name);
        const crc = crc32(data);

        const local = new Uint8Array(30 + nameBytes.length);
        const lv = new DataView(local.buffer);
        lv.setUint32(0, 0x04034b50, true);
        lv.setUint16(4, 20, true);                 // version needed
        lv.setUint16(8, 0, true);                  // method: stored
        lv.setUint16(12, DOS_DATE, true);
        lv.setUint32(14, crc, true);
        lv.setUint32(18, data.length, true);       // compressed size
        lv.setUint32(22, data.length, true);       // uncompressed size
        lv.setUint16(26, nameBytes.length, true);
        local.set(nameBytes, 30);

        const central = new Uint8Array(46 + nameBytes.length);
        const cv = new DataView(central.buffer);
        cv.setUint32(0, 0x02014b50, true);
        cv.setUint16(4, 20, true);                 // version made by
        cv.setUint16(6, 20, true);                 // version needed
        cv.setUint16(10, 0, true);                 // method: stored
        cv.setUint16(14, DOS_DATE, true);
        cv.setUint32(16, crc, true);
        cv.setUint32(20, data.length, true);
        cv.setUint32(24, data.length, true);
        cv.setUint16(28, nameBytes.length, true);
        cv.setUint32(42, offset, true);            // where the local header is
        central.set(nameBytes, 46);

        locals.push(local, data);
        centrals.push(central);
        offset += local.length + data.length;
    }
    const centralSize = centrals.reduce((n, c) => n + c.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, entries.length, true);
    ev.setUint16(10, entries.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);

    const out = new Uint8Array(offset + centralSize + end.length);
    let p = 0;
    for (const part of [...locals, ...centrals, end]) { out.set(part, p); p += part.length; }
    return out;
}

/**
 * The rows, as an Excel workbook: one sheet, the header in bold, numbers and dates typed, the rest
 * as the column's `format` shows it.
 *
 * Which rows is the caller's, as for `toCsv`: the selection when there is one, otherwise what the
 * filter selects.
 */
export function toXlsx(
    rows: readonly Record<string, unknown>[],
    columns: readonly XlsxColumn[],
): Blob {
    const encoder = new TextEncoder();
    const parts: Record<string, string> = { ...PARTS_FIXED, 'xl/worksheets/sheet1.xml': sheetXml(rows, columns) };
    const entries = Object.entries(parts).map(([name, xml]) => [name, encoder.encode(xml)] as [string, Uint8Array]);
    return new Blob([zipStored(entries)], { type: XLSX_TYPE });
}
