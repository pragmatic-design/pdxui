// The data skill says what the data types accept, so an app does not have to read the .d.ts.
//
// Four things an app otherwise looks up in `node_modules/@pdxui/core/dist/…`:
//   1. OR across fields. `setFilter([{field, operator, value}])` is an implicit AND;
//      `CompositeFilter { logic, filters }` exists and is what "customer OR container" needs.
//   2. The DataSource surface. Bulk selection and "export what is filtered" need members beyond
//      the common six.
//   3. What `cell:` accepts. "Use cell:, not format:" alone leads an app to write
//      `cell: (row) => '…'`, which the grid does not render: it warns and shows the raw value.
//   4. `fakeTransport`'s options.
//
// The expected names are read from the sources, not typed here: a member added to DataSource, a new
// cell renderer or a new transport option turns this red until the page names it. Each check looks
// only at the section it is about — `data`, `page` or `log` appear all over a catalogue page, and a
// check that finds them anywhere passes for the wrong reason (measured: a check over the whole page
// passes `idField` and `log` on words from other recipes).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createDataSource } from '../src/data/data-source';
import { areaText } from './skill-pages';

const REPO = join(__dirname, '../../..');
const SKILLS = join(REPO, 'marketplace/plugins/pdxui/skills');
// The data area: its index and its component pages.
const DATA_PAGE = areaText('data');
const RECIPES = readFileSync(join(SKILLS, 'pdxui/references/recipes.md'), 'utf-8').replace(/\r\n/g, '\n');

/** The text from `start` to the next heading at the same level (`nextHeading`), or the end. */
function section(text: string, start: string, nextHeading: RegExp): string {
    const from = text.indexOf(start);
    expect(from, `section "${start}" not found`).toBeGreaterThan(-1);
    const rest = text.slice(from + start.length);
    const to = rest.search(nextHeading);
    return to === -1 ? rest : rest.slice(0, to);
}

const DATA_SOURCE = section(DATA_PAGE, '### `<pdx-data-source>`', /^### `</m);
const DATA_GRID = section(DATA_PAGE, '### `<pdx-data-grid>`', /^### `</m);
const MOCK_BACKEND = section(RECIPES, '## A mock backend, before there is a backend', /^## /m);

/** The body of `interface <name>` (or `<name><T>`) in a source file, up to its closing brace. */
function interfaceBody(file: string, name: string): string {
    const src = readFileSync(join(REPO, file), 'utf-8').replace(/\r\n/g, '\n');
    const start = src.search(new RegExp(`export interface ${name}(<[^>]*>)?\\s*\\{`));
    expect(start, `interface ${name} not found in ${file}`).toBeGreaterThan(-1);
    return src.slice(start, src.indexOf('\n}', start));
}

/** Member names declared at the first level of an interface body: `name:`, `name?:`, `name(`. */
function members(body: string): string[] {
    // Match: a four-space indented member at the start of a line. Groups: [1]=name
    return [...body.matchAll(/^ {4}(\w+)\??\s*[:(]/gm)].map(m => m[1]);
}

/** `text` names `member` as code: inside a `code span`, or as a `member:` key in a code block. */
function namesAsCode(text: string, member: string): boolean {
    return new RegExp('`[^`\\n]*\\b' + member + '\\b[^`\\n]*`|^\\s*' + member + '\\??:', 'm').test(text);
}

describe('the data skill page', () => {
    it('says how to OR across fields: CompositeFilter, with an example', () => {
        expect(DATA_SOURCE.includes('CompositeFilter'), 'pdx-data-source does not name CompositeFilter').toBe(true);
        expect(/logic:\s*'or'/.test(DATA_SOURCE), 'no OR example under pdx-data-source').toBe(true);
    });

    it('and the example does what the page says, on a real DataSource', async () => {
        // The page's own example, run: one search term over two fields. An AND of the two would find
        // nothing here — no row has "ms" in both — so a green is the OR and not a lucky filter.
        const rows = createDataSource({
            data: [
                { id: 1, customer: 'Rossi', container: 'MSCU1' },
                { id: 2, customer: 'Adams', container: 'TGHU2' },
                { id: 3, customer: 'Bianchi', container: 'CMAU3' },
            ],
            pageSize: 0,
        });
        const q = 'ms';
        rows.setFilter([{
            logic: 'or',
            filters: [
                { field: 'customer', operator: 'contains', value: q },
                { field: 'container', operator: 'contains', value: q },
            ],
        }]);
        await rows.refresh();
        expect(rows.data().map(r => r.id)).toEqual([1, 2]);
    });

    it('lists the whole DataSource surface', () => {
        const all = members(interfaceBody('packages/core/src/data/data-source.ts', 'DataSource'));
        // Control: the seven the lab needed and did not find are among what the source declares.
        for (const needed of ['selectionEnabled', 'setSelected', 'getAllIds', 'distinctValues', 'loadMore', 'patch', 'getById']) {
            expect(all, `DataSource no longer declares ${needed}`).toContain(needed);
        }
        expect(all.length, 'the extractor found the interface').toBeGreaterThan(30);
        const missing = all.filter(m => !namesAsCode(DATA_SOURCE, m));
        expect(missing, 'DataSource members the pdx-data-source section does not name').toEqual([]);
    });

    it('says what cell: accepts — a CellSpec from a builder, never a function', () => {
        expect(DATA_GRID.includes('CellSpec'), 'pdx-data-grid does not name CellSpec').toBe(true);
        const src = readFileSync(join(REPO, 'packages/core/src/data/data-grid-types.ts'), 'utf-8');
        // Match: a one-line builder signature returning a Cell*Spec. `.*` rather than `[^)]*`: link()'s
        // parameters contain their own parentheses. Groups: [1]=builder name
        const builders = [...src.matchAll(/^export function (\w+)\(.*\): Cell\w+Spec\s*\{$/gm)].map(m => m[1]);
        expect(builders.length, 'the builders were found').toBeGreaterThanOrEqual(7);
        const unnamed = builders.filter(b => !DATA_GRID.includes(`${b}(`));
        expect(unnamed, 'cell builders the pdx-data-grid section does not name').toEqual([]);
        expect(/cell: \(row\) =>[^\n]*ignored/i.test(DATA_GRID), 'it does not say that a function in cell: is ignored').toBe(true);
        expect(/format: \(v/.test(DATA_GRID), 'it does not show a plain-string format function relabelling a value').toBe(true);
    });
});

describe('the mock-backend recipe', () => {
    it('lists every fakeTransport option', () => {
        const options = members(interfaceBody('packages/core/src/data/fake-transport.ts', 'FakeTransportOptions'));
        expect(options.length, 'the extractor found the options').toBeGreaterThanOrEqual(8);
        const missing = options.filter(o => !namesAsCode(MOCK_BACKEND, o));
        expect(missing, 'fakeTransport options the mock-backend recipe does not name').toEqual([]);
    });

    it('points at the full DataSource surface instead of implying its table is all of it', () => {
        expect(MOCK_BACKEND.includes('pdxui-data'), 'no pointer to the full surface').toBe(true);
    });
});
