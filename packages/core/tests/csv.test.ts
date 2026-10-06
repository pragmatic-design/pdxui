// CSV export — the escaping table, one assertion per rule.
//
// A grid of business data that cannot be exported is the most reliable complaint a line-of-business
// application receives.
//
// Every rule below is a bug the first time somebody exports a real row — a ticket title with a
// comma, a customer called «D'Angelo & Co, Ltd», a note with a line break in it. They are asserted
// against the EXACT expected line rather than "contains", because a wrong quote in the right place
// still parses and puts the data in the wrong column.

import { describe, it, expect } from 'vitest';
import { toCsv, csvCell } from '../src/data/csv';

describe('csvCell — the escaping table', () => {
    it('leaves an ordinary value alone', () => {
        expect(csvCell('Northwind')).toBe('Northwind');
        expect(csvCell(42)).toBe('42');
    });

    it('quotes a value containing a comma', () => {
        expect(csvCell('Contoso, Ltd')).toBe('"Contoso, Ltd"');
    });

    it('quotes a value containing a quote, and doubles the quote', () => {
        // RFC 4180: the escape for a quote is another quote.
        expect(csvCell('the "urgent" one')).toBe('"the ""urgent"" one"');
    });

    it('quotes a value containing a newline', () => {
        expect(csvCell('first line\nsecond line')).toBe('"first line\nsecond line"');
        expect(csvCell('crlf\r\nhere')).toBe('"crlf\r\nhere"');
    });

    it('defuses a formula, and says so in the cell', () => {
        // `=1+1` in a CSV opened in Excel is a FORMULA, and `=HYPERLINK(...)` or `=cmd|...` is the
        // injection this rule exists for. The value is kept — prefixed with an apostrophe, which
        // is how a spreadsheet is told "this is text" — rather than dropped or silently altered.
        expect(csvCell('=1+1')).toBe(`"'=1+1"`);
        expect(csvCell('+41 22 000')).toBe(`"'+41 22 000"`);
        expect(csvCell('-5')).toBe(`"'-5"`);
        expect(csvCell('@handle')).toBe(`"'@handle"`);
    });

    it('control — a minus INSIDE a value is not a formula', () => {
        expect(csvCell('T-2000')).toBe('T-2000');
        expect(csvCell('a=b')).toBe('a=b');
    });

    it('writes nothing for null and undefined', () => {
        expect(csvCell(null)).toBe('');
        expect(csvCell(undefined)).toBe('');
    });

    it('renders a date as an ISO day, not as a locale string', () => {
        // A CSV is read by a machine as often as by a person, and `9/20/2026` is ambiguous in half
        // the world. A column that wants a formatted date passes a `format`.
        expect(csvCell(new Date(Date.UTC(2026, 8, 20)))).toBe('2026-09-20');
    });
});

describe('toCsv', () => {
    const rows = [
        { reference: 'T-2000', subject: 'Printer, jammed', hours: 2 },
        { reference: 'T-2001', subject: 'VPN "drops"', hours: 5 },
    ];
    const columns = [
        { field: 'reference', header: 'Ref' },
        { field: 'subject', header: 'Subject' },
    ];

    it('writes the header the user sees, and only the columns they see', () => {
        const csv = toCsv(rows, columns);
        const lines = csv.replace(/^﻿/, '').split('\r\n');
        expect(lines[0]).toBe('Ref,Subject');
        expect(lines[1]).toBe('T-2000,"Printer, jammed"');
        expect(lines[2]).toBe('T-2001,"VPN ""drops"""');
        // `hours` is in the data and not in the columns: it is not in the file.
        expect(csv).not.toContain('hours');
    });

    it('starts with a BOM, or Excel reads accented text as mojibake', () => {
        // The complaint that follows every first CSV export: «Città» arriving as «CittÃ ».
        expect(toCsv([{ city: 'Città' }], [{ field: 'city', header: 'City' }])).toMatch(/^﻿/);
    });

    it('ends its lines with CRLF, which is what RFC 4180 says', () => {
        expect(toCsv(rows, columns)).toContain('\r\n');
    });

    it('follows a column FORMAT, so a coded value exports as the label on screen', () => {
        // The grid renders `closed` as «Closed»; a file that says `closed` is a different file
        // from the one the user is looking at.
        const csv = toCsv(
            [{ status: 'closed' }],
            [{ field: 'status', header: 'Status', format: (v: unknown) => (v === 'closed' ? 'Closed' : 'Open') }],
        );
        expect(csv).toContain('Closed');
        expect(csv).not.toContain('closed');
    });

    it('reads a dotted field path', () => {
        const csv = toCsv([{ customer: { name: 'Contoso' } }], [{ field: 'customer.name', header: 'Customer' }]);
        expect(csv).toContain('Contoso');
    });

    it('control — no rows still produces the header', () => {
        // An empty export is a file with the columns in it, not an empty file: the user asked for
        // a list and got the list, which happens to have nothing in it.
        const csv = toCsv([], columns).replace(/^﻿/, '');
        expect(csv).toBe('Ref,Subject\r\n');
    });
});
