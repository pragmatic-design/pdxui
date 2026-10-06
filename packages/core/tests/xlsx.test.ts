// An Excel export with no dependency: an .xlsx is a ZIP of a few XML parts.
//
// A list offers Excel beside CSV. Excel does not need a writer that is a dependency — a workbook is six small XML files in a ZIP, and a ZIP that
// is STORED (not compressed) is headers, bytes and a CRC-32 each. What this suite reads back is
// the file itself, with a reader written here: a test that asked `toXlsx` about its own output
// would pass on a writer that agreed with itself and nobody else.
import { describe, it, expect } from 'vitest';
import { toXlsx } from '../src/data/xlsx';

/** A stored ZIP, read the way an unzipper reads it: from the end of central directory backwards. */
async function unzip(blob: Blob): Promise<{ parts: Map<string, string>; crcOk: Map<string, boolean> }> {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const view = new DataView(bytes.buffer);
    let eocd = bytes.length - 22;
    while (eocd >= 0 && view.getUint32(eocd, true) !== 0x06054b50) eocd--;
    expect(eocd, 'no end of central directory').toBeGreaterThanOrEqual(0);
    const count = view.getUint16(eocd + 10, true);
    let p = view.getUint32(eocd + 16, true);
    const parts = new Map<string, string>();
    const crcOk = new Map<string, boolean>();
    const decoder = new TextDecoder();
    for (let i = 0; i < count; i++) {
        expect(view.getUint32(p, true), 'central directory header').toBe(0x02014b50);
        const method = view.getUint16(p + 10, true);
        const crc = view.getUint32(p + 16, true);
        const size = view.getUint32(p + 20, true);
        const nameLen = view.getUint16(p + 28, true);
        const extraLen = view.getUint16(p + 30, true);
        const commentLen = view.getUint16(p + 32, true);
        const local = view.getUint32(p + 42, true);
        const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
        expect(method, `${name} is compressed; the writer stores`).toBe(0);
        expect(view.getUint32(local, true), `${name}: local header`).toBe(0x04034b50);
        const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
        const data = bytes.subarray(start, start + size);
        parts.set(name, decoder.decode(data));
        crcOk.set(name, crc32(data) === crc);
        p += 46 + nameLen + extraLen + commentLen;
    }
    return { parts, crcOk };
}

/** CRC-32 (IEEE), computed bit by bit: a second implementation, not the writer's table. */
function crc32(data: Uint8Array): number {
    let crc = 0xFFFFFFFF;
    for (const byte of data) {
        crc ^= byte;
        for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

const COLUMNS = [
    { field: 'reference', header: 'Ref.' },
    { field: 'hours', header: 'Hours' },
    { field: 'opened', header: 'Opened' },
    { field: 'status', header: 'Status', format: (v: unknown) => (v === 'closed' ? 'Closed' : 'Open') },
    { field: 'note', header: 'Note' },
];
const ROWS = [
    { reference: 'T-1000', hours: 7.5, opened: '2026-09-01', status: 'closed', note: '=1+1' },
    { reference: 'T-1001', hours: 3, opened: new Date(Date.UTC(2026, 8, 2)), status: 'open', note: 'a < b & "c"' },
];

describe('toXlsx', () => {
    it('is a spreadsheet: the right type, and the six parts a workbook is made of', async () => {
        const blob = toXlsx(ROWS, COLUMNS);
        expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        const { parts } = await unzip(blob);
        expect([...parts.keys()].sort()).toEqual([
            '[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels',
            'xl/styles.xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml',
        ].sort());
    });

    it('the sheet has the header, bold, and every row', async () => {
        const sheet = (await unzip(toXlsx(ROWS, COLUMNS))).parts.get('xl/worksheets/sheet1.xml')!;
        const rows = sheet.match(/<row /g) ?? [];
        expect(rows, 'a header and two rows').toHaveLength(3);
        expect(sheet).toMatch(/<c r="A1" t="inlineStr" s="1"><is><t>Ref\.<\/t><\/is><\/c>/);
        expect(sheet).toContain('<t>T-1001</t>');
        // The column's format, as on screen and in the CSV: the code is not what a reader sees.
        expect(sheet).toContain('<t>Closed</t>');
        expect(sheet).not.toContain('<t>closed</t>');
    });

    it('a number is a number, and a date is a serial number in the date style', async () => {
        const sheet = (await unzip(toXlsx(ROWS, COLUMNS))).parts.get('xl/worksheets/sheet1.xml')!;
        expect(sheet).toContain('<c r="B2" t="n"><v>7.5</v></c>');
        // 2026-09-01 is day 46266 of the 1900 system; the Date and the ISO string are the same day.
        expect(sheet).toContain('<c r="C2" s="2"><v>46266</v></c>');
        expect(sheet).toContain('<c r="C3" s="2"><v>46267</v></c>');
        const styles = (await unzip(toXlsx(ROWS, COLUMNS))).parts.get('xl/styles.xml')!;
        expect(styles, 'style 2 is not a date format').toMatch(/<cellXfs count="3">.*<xf numFmtId="14"/s);
    });

    it('each column is as wide as what it holds, and a date column is wide enough for a date', async () => {
        // Found opening the file in Excel: at the default width a date reads «########».
        const sheet = (await unzip(toXlsx(ROWS, COLUMNS))).parts.get('xl/worksheets/sheet1.xml')!;
        const widths = [...sheet.matchAll(/<col min="(\d+)" max="\d+" width="([\d.]+)" customWidth="1"\/>/g)]
            .map((m) => [Number(m[1]), Number(m[2])] as const);
        expect(widths, 'no <cols>: every column at the default width').toHaveLength(COLUMNS.length);
        const width = (col: number) => widths.find(([c]) => c === col)![1];
        expect(width(3), 'the date column is narrower than a date').toBeGreaterThanOrEqual(12);
        // The subject-like column («a < b & "c"», 11 characters) is wider than the hours one.
        expect(width(5)).toBeGreaterThan(width(2));
        // `<cols>` comes before `<sheetData>`, or Excel repairs the file.
        expect(sheet.indexOf('<cols>')).toBeLessThan(sheet.indexOf('<sheetData>'));
    });

    it('a value that starts with = is text, never a formula', async () => {
        const sheet = (await unzip(toXlsx(ROWS, COLUMNS))).parts.get('xl/worksheets/sheet1.xml')!;
        expect(sheet).toContain('<c r="E2" t="inlineStr"><is><t>=1+1</t></is></c>');
        expect(sheet, 'a formula was written').not.toMatch(/<f>/);
        // And escaped: the XML stays XML.
        expect(sheet).toContain('<t>a &lt; b &amp; &quot;c&quot;</t>');
    });

    it('control — every CRC-32 in the central directory matches its part', async () => {
        const { crcOk } = await unzip(toXlsx(ROWS, COLUMNS));
        for (const [name, ok] of crcOk) expect(ok, `${name}: CRC-32 does not match`).toBe(true);
    });

    it('a control character XML forbids is dropped, so the sheet stays well-formed', async () => {
        const sheet = (await unzip(toXlsx([{ note: `bell${String.fromCharCode(7)}here\tand tab` }], [{ field: 'note' }])))
            .parts.get('xl/worksheets/sheet1.xml')!;
        expect(sheet).toContain('<t>bellhere\tand tab</t>');
    });

    it('an empty list is still a workbook: the header row alone', async () => {
        const sheet = (await unzip(toXlsx([], COLUMNS))).parts.get('xl/worksheets/sheet1.xml')!;
        expect(sheet.match(/<row /g) ?? []).toHaveLength(1);
    });
});
