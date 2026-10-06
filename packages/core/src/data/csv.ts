// CSV export — the rows a user is looking at, as a file they can open.
//
// A grid of business data that cannot be exported is the most reliable complaint a line-of-business
// application receives: `pdx-chart` exports a PNG, so exporting is accepted as this library's job,
// and the DATA needs it too.
//
// What makes this more than `rows.map(r => r.join(','))` is four rules, each of which is a bug the
// first time a real row goes through it. They are in `csvCell`, with the reason beside each one.
//
// Excel (.xlsx) is `xlsx.ts`, beside this, with the same signature and no dependency.

/**
 * The byte order mark Excel needs to read the file as UTF-8, and the line ending RFC 4180 asks
 * for. Named, because a literal BOM in source is an invisible character in a diff.
 */
const BOM = String.fromCharCode(0xFEFF);
const CRLF = '\r\n';

/** A column as the exporter needs it: what to read, what to call it, and how to render it. */
export interface CsvColumn {
    /** The row's field. A dotted path reads into nested objects. */
    field: string;
    /** The header text — the one the user sees on screen, not the field name. */
    header?: string;
    /** The grid's own cell formatter, so a coded value exports as the label that is on screen. */
    format?: (value: unknown, row?: Record<string, unknown>) => unknown;
}

/** A value's path into a row: `customer.name` reads `row.customer.name`. Shared with `xlsx.ts`. */
export function readPath(row: Record<string, unknown>, path: string): unknown {
    if (!path.includes('.')) return row[path];
    let current: unknown = row;
    for (const part of path.split('.')) {
        if (current === null || current === undefined) return undefined;
        current = (current as Record<string, unknown>)[part];
    }
    return current;
}

/**
 * One value, escaped for a CSV cell.
 *
 * The four rules, and why each is not optional:
 *
 *   - a **comma** inside a value would start a new column, so the value is quoted. The first
 *     ticket titled "Printer, jammed" is the bug report;
 *   - a **quote** inside a quoted value ends it early: RFC 4180 escapes it by doubling it;
 *   - a **newline** would start a new row. Quoted, a line break is part of the value — which is
 *     what a note field contains;
 *   - a leading **`=`, `+`, `-` or `@`** is a FORMULA to a spreadsheet, and `=HYPERLINK(...)` or
 *     `=cmd|...` is how a CSV export becomes an attack on whoever opens it. The value is KEPT and
 *     prefixed with an apostrophe, which is how a spreadsheet is told "this is text" — dropping
 *     or rewriting the data would be a worse answer than showing it as what it is.
 *
 * A `Date` becomes an ISO day: a CSV is read by a machine as often as by a person, and `9/20/2026`
 * is ambiguous in half the world. A column that wants it formatted passes a `format`.
 */
export function csvCell(value: unknown): string {
    if (value === null || value === undefined) return '';

    let text: string;
    if (value instanceof Date) text = value.toISOString().slice(0, 10);
    else text = String(value);

    // Formula injection: only at the START of the value — `T-2000` and `a=b` are data.
    const isFormula = /^[=+\-@\t\r]/.test(text);
    if (isFormula) return `"'${text.replace(/"/g, '""')}"`;

    if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
}

/**
 * The rows, as the bytes of a CSV file.
 *
 * A BOM first, because without it Excel decodes UTF-8 as its local code page and the first
 * accented name arrives as mojibake — the complaint that follows every first CSV export. Lines end
 * with CRLF, which is what RFC 4180 says and what Excel expects.
 *
 * What is NOT decided here: WHICH rows. That is the caller's, and it is the important half — a
 * user who filtered 8000 rows down to 40 wants those 40, and a selection wins over the filter.
 */
export function toCsv(
    rows: readonly Record<string, unknown>[],
    columns: readonly CsvColumn[],
): string {
    const header = columns.map(c => csvCell(c.header ?? c.field)).join(',');
    const body = rows.map(row =>
        columns.map(col => {
            const raw = readPath(row, col.field);
            return csvCell(col.format ? col.format(raw, row) : raw);
        }).join(','),
    );
    // The BOM as an ESCAPE, never pasted: a literal one is invisible in a diff and the linter
    // rejects it as irregular whitespace — the same property that makes it useful in the FILE
    // makes it unreadable in the SOURCE.
    return BOM + [header, ...body].join(CRLF) + CRLF;
}
