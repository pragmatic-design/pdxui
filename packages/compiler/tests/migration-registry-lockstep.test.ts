// migration.md and the registry of language changes say the same thing (#159, part 1).
//
// `docs/language/beta/migration.md` is the human table of every alpha form the beta changes or removes;
// `LANGUAGE_CHANGES` (#121) is what `pdx migrate` applies and the compiler reports. Both are written by
// hand, so each can lose a line the other keeps: a change registered with no row is a rewrite nobody
// reads about, and a row naming an id the registry no longer has promises a rewrite that is gone.
// A row ties itself to the registry by naming its ids in the `pdx migrate` column, `landed: \`id\``.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LANGUAGE_CHANGES } from '../src/language/changes';

const MIGRATION = join(__dirname, '..', '..', '..', 'docs', 'language', 'beta', 'migration.md');

/** The table rows of a markdown page, as cells; the header and separator rows are skipped. */
function rows(markdown: string): string[][] {
    return markdown.split(/\r?\n/)
        .filter(line => line.startsWith('| ') && !/^\|\s*-/.test(line) && !/^\|\s*Alpha\s*\|/.test(line))
        // The columns, split on the pipes that are not escaped (`\|` is a pipe inside a cell).
        .map(line => line.split(/(?<!\\)\|/).map(c => c.trim()).slice(1));
}

/** The ids a table row's `pdx migrate` column names after `landed:`: `landed: \`a\`, \`b\``. */
export function citedIds(markdown: string): Set<string> {
    const ids = new Set<string>();
    for (const cells of rows(markdown)) {
        // Match: `landed:` and the backticked ids that follow it, joined by commas or «and». The longest
        // separator is tried first: `, and` read as `,` would end the list at the word «and».
        for (const m of (cells[2] ?? '').matchAll(/landed:\s*((?:`[a-z][A-Za-z0-9-]*`(?:\s*(?:,\s*and|,|and)\s*)?)+)/g)) {
            for (const id of m[1].matchAll(/`([a-z][A-Za-z0-9-]*)`/g)) ids.add(id[1]);
        }
    }
    return ids;
}

/**
 * The names a row's Alpha column puts in backticks: a removed export is registered as
 * `export:<package>:<name>`, and its row names the export, `createBus`, where the others name an id.
 */
export function alphaNames(markdown: string): Set<string> {
    const names = new Set<string>();
    for (const cells of rows(markdown)) {
        for (const m of (cells[0] ?? '').matchAll(/`([^`]+)`/g)) names.add(m[1]);
    }
    return names;
}

/**
 * Whether the page has the row a registered change needs: its id cited, or, for an export, its name —
 * as written, or called, `currentLoaderData()`.
 */
function hasRow(id: string, cited: Set<string>, alpha: Set<string>): boolean {
    const exported = /^export:[^:]+:(.+)$/.exec(id);
    return exported ? alpha.has(exported[1]) || alpha.has(`${exported[1]}()`) : cited.has(id);
}

describe('the scan can fail', () => {
    it('reads the ids after landed:, and only from the pdx migrate column', () => {
        const table = [
            '| Alpha | Beta | `pdx migrate` | Source |',
            '|---|---|---|---|',
            '| `a` | `b` | mechanical — landed: `one-id`, `two-id` and `menu-closeAll`, and `five` in a page | #1 |',
            '| `c \\| d`, `createBus`, `currentLoaderData()` | `e` | flagged (landed: `four`; more words) | #2 |',
            '| `landed: `not-this`` | `f` | not detected | #3 |',
        ].join('\n');
        expect([...citedIds(table)].sort()).toEqual(['five', 'four', 'menu-closeAll', 'one-id', 'two-id']);
        expect(alphaNames(table).has('createBus')).toBe(true);
        expect(hasRow('export:@pdxui/core:createBus', citedIds(table), alphaNames(table))).toBe(true);
        expect(hasRow('export:@pdxui/router:currentLoaderData', citedIds(table), alphaNames(table))).toBe(true);
        expect(hasRow('export:@pdxui/core:useWritable', citedIds(table), alphaNames(table))).toBe(false);
    });
});

describe('migration.md and LANGUAGE_CHANGES', () => {
    const page = readFileSync(MIGRATION, 'utf-8');
    const cited = citedIds(page);
    const alpha = alphaNames(page);
    const registered = new Set(LANGUAGE_CHANGES.map(c => c.id));

    it('reads a table that names ids', () => {
        expect(cited.size).toBeGreaterThan(50);
    });

    it('every registered change has its row', () => {
        expect([...registered].filter(id => !hasRow(id, cited, alpha)).sort()).toEqual([]);
    });

    it('every id a row names is registered', () => {
        expect([...cited].filter(id => !registered.has(id)).sort()).toEqual([]);
    });
});
