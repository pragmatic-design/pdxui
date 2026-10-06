// Reading a CSV back in: the other half of «export».
//
// ── Why the parser is HERE and not in @pdxui/core ──
//
// Parsing CSV well is a library's job — encodings, dialects, quoting rules that disagree between
// Excel and RFC 4180 — and adding a half one to the framework is worse than adding none: it would
// be the one every consumer reaches for and the one that fails on their file. `toCsv` is in core
// because WRITING is a closed problem; reading is not.
//
// What this story demonstrates is the SHAPE of an import, and that part IS framework-agnostic:
// preview before commit, a reason on the row rather than a summary at the top, only the valid rows
// written, and the refused ones handed back as a file. None of that is about CSV.

/** A file read into its header and its rows, still all strings. */
export interface CsvTable {
    header: string[];
    /** One array per line, in file order. `rows[0]` is line 2 of the file. */
    rows: string[][];
}

/**
 * Split a CSV into cells, RFC 4180 as Excel writes it.
 *
 * A hand-rolled `split(',')` is what an application writes first and what breaks on the first
 * customer called «Wayne, Enterprises». Quoted fields carry commas, CRLF and doubled quotes; a
 * BOM leads the file Excel saved; a line ends CRLF or LF.
 */
export function parseCsv(text: string): CsvTable {
    // The BOM `toCsv` writes so Excel decodes UTF-8 — stripped on the way back in, or the first
    // header name carries an invisible character and matches nothing.
    const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

    const lines: string[][] = [];
    let row: string[] = [];
    let cell = '';
    let quoted = false;

    for (let i = 0; i < src.length; i++) {
        const ch = src[i];
        if (quoted) {
            if (ch === '"') {
                // A doubled quote inside a quoted field is one literal quote.
                if (src[i + 1] === '"') { cell += '"'; i++; }
                else quoted = false;
            } else cell += ch;
            continue;
        }
        if (ch === '"' && cell === '') { quoted = true; continue; }
        if (ch === ',') { row.push(cell); cell = ''; continue; }
        if (ch === '\r') continue;                 // CRLF: the \n does the ending
        if (ch === '\n') { row.push(cell); lines.push(row); row = []; cell = ''; continue; }
        cell += ch;
    }
    // A file that does not end with a newline still has a last row.
    if (cell !== '' || row.length > 0) { row.push(cell); lines.push(row); }

    // A trailing blank line is not a record. Excel writes one.
    const kept = lines.filter((r) => r.some((c) => c.trim() !== ''));
    const header = (kept.shift() ?? []).map((h) => h.trim());
    return { header, rows: kept };
}

/** One field of the entity, and the header names a file may call it by. */
export interface ImportField {
    /** The entity's own field name. */
    name: string;
    /** Header names that mean this field, lower-case. The field's own name is always accepted. */
    aliases?: string[];
    required?: boolean;
    /** The only values this field takes. A value outside it is the row's reason. */
    oneOf?: string[];
}

/** A row as it would be imported, with the reason it cannot be, if there is one. */
export interface ImportRow {
    /** The line of the FILE, 1-based and counting the header — «line 40 of 200» has to be findable. */
    line: number;
    values: Record<string, string>;
    /** Empty when the row is good. */
    problem: string;
}

export interface ImportPlan {
    rows: ImportRow[];
    /** Header names no field claimed. Shown, never dropped in silence. */
    ignored: string[];
}

/** The largest file this screen reads. Bigger than a spreadsheet anybody hand-maintains. */
export const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Why this file cannot be read at all, or null.
 *
 * At the DOOR, before any preview: a preview of a file the screen cannot use is a screen full of
 * empty rows and no explanation. Each reason is separate because each is a different mistake and
 * «invalid file» tells the reader nothing about which.
 */
export function refuseAtTheDoor(table: CsvTable, fields: ImportField[], t: (key: string, vars?: Record<string, unknown>) => string): string | null {
    if (table.header.length === 0) return t('import.door.empty');
    if (table.header.length < 2) return t('import.door.oneColumn');
    if (table.rows.length === 0) return t('import.door.noRows');
    const claimed = table.header.filter((h) => fieldFor(h, fields) !== null);
    if (claimed.length === 0) return t('import.door.noMatch', { names: table.header.join(', ') });
    return null;
}

/** The field a header name means, or null. */
function fieldFor(header: string, fields: ImportField[]): ImportField | null {
    const key = header.trim().toLowerCase();
    return fields.find((f) => f.name.toLowerCase() === key || (f.aliases ?? []).includes(key)) ?? null;
}

/**
 * What the file would do, row by row — WITHOUT doing any of it.
 *
 * `problem` is per row and carries the sentence, because a summary at the top is unusable: a reader
 * with 200 lines and «3 rows are invalid» has to find them by eye.
 */
export function planImport(
    table: CsvTable,
    fields: ImportField[],
    t: (key: string, vars?: Record<string, unknown>) => string,
): ImportPlan {
    const columns = table.header.map((h) => fieldFor(h, fields));
    const ignored = table.header.filter((_, i) => columns[i] === null);

    const rows = table.rows.map((cells, i) => {
        const values: Record<string, string> = {};
        for (let c = 0; c < columns.length; c++) {
            const field = columns[c];
            if (field) values[field.name] = (cells[c] ?? '').trim();
        }

        // The FIRST reason, not all of them: a row with three problems is fixed one at a time, and
        // a cell holding three sentences is a cell nobody reads.
        let problem = '';
        for (const field of fields) {
            const value = values[field.name] ?? '';
            if (field.required && value === '') { problem = t('import.row.required', { field: field.name }); break; }
            if (field.oneOf && value !== '' && !field.oneOf.includes(value)) {
                problem = t('import.row.oneOf', { field: field.name, value, allowed: field.oneOf.join(', ') });
                break;
            }
        }
        // +2: the header is line 1, and `rows[0]` is the line after it.
        return { line: i + 2, values, problem };
    });

    return { rows, ignored };
}
