// A DataSource is a source for every component that reads one, not a part of the grid.
//
// An agent filling a select from an API has to find out that the grid's source works there too, so
// a select's, a list's or a chart's page says it takes one. The consumers are read from the sources here, the
// same way the generator reads them, so a component that starts taking a DataSource turns this red
// until both pages say so.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { AREAS, componentPages } from './skill-pages';

const REPO = join(__dirname, '..', '..', '..');
const UI_SRC = join(REPO, 'packages', 'ui', 'src');

/** Every component whose own sources name the DataSource type, the source component itself aside. */
function consumers(): string[] {
    return readdirSync(UI_SRC).filter(d => existsSync(join(UI_SRC, d, `pdx-${d}.ts`)) && d !== 'data-source')
        .filter(d => readdirSync(join(UI_SRC, d)).filter(f => f.endsWith('.ts'))
            .some(f => /\bDataSource\b/.test(readFileSync(join(UI_SRC, d, f), 'utf-8'))))
        .map(d => `pdx-${d}`).sort();
}

const pages = new Map(AREAS.flatMap(a => componentPages(a).map(p => [p.tag, p.text] as const)));

describe('the DataSource and the components that read one', () => {
    const found = consumers();

    it('finds the consumers — select, list, chart and form among them', () => {
        for (const t of ['pdx-select', 'pdx-list', 'pdx-chart', 'pdx-form', 'pdx-data-grid']) expect(found).toContain(t);
        expect(found.length).toBeGreaterThanOrEqual(13);
    });

    it('pdx-data-source\'s page names every consumer, with a link to its page', () => {
        const page = pages.get('pdx-data-source') ?? '';
        const missing = found.filter(t => !new RegExp(`\\[\`<${t}>\`\\]\\([^)]*${t}\\.md\\)`).test(page));
        expect(missing, 'consumers the pdx-data-source page does not link').toEqual([]);
    });

    it('each consumer\'s page says it takes a DataSource, and how', () => {
        const silent = found.filter(t => !/^\*\*Takes a DataSource:\*\* .+/m.test(pages.get(t) ?? ''));
        expect(silent).toEqual([]);
    });

    it('a consumer that injects one says it can sit inside a <pdx-data-source>', () => {
        // pdx-select injects with a type argument, `tryInject<DataSource<any>>('dataSource', …)`: a
        // reader that stops at the first `>` misses it, and the page then hides the provider pattern.
        const injectors = found.filter(t => {
            const dir = join(UI_SRC, t.slice(4));
            return readdirSync(dir).filter(f => f.endsWith('.ts'))
                .some(f => /tryInject\b[^(]*\(\s*'dataSource'/.test(readFileSync(join(dir, f), 'utf-8')));
        });
        expect(injectors).toContain('pdx-select');
        const silent = injectors.filter(t => !/^\*\*Takes a DataSource:\*\*.*inside a \[`<pdx-data-source>`\]/m.test(pages.get(t) ?? ''));
        expect(silent).toEqual([]);
    });

    it('and no page calls it a part of the grid', () => {
        expect(pages.get('pdx-data-source') ?? '').not.toMatch(/plumbing for grids/);
    });
});
