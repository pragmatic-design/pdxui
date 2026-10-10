// What the component and design galleries say must be true, and must be ours to say.
//
// The showcase pages (`packages/compiler/demo/showcase-new/pages`) are the site's public galleries:
// `port-demos.mjs` publishes every comp-* and design-* page. What they must not carry:
//
// - "Competitor Comparison" tables rating named libraries ("Mantine only", "MUI only") and making
//   claims nobody has verified ("No competitor currently implements this"). A comparison belongs in
//   a document with sources, not in a component gallery.
// - Reference tables that disagree with the component: pdx-breadcrumb's separator defaults to ''
//   (the theme's separator), not '/'.
// - `<span class="pdx-field-required">*</span>`: the class appends its own " *", so the label would
//   read "Email * *".
// - design-colors presenting the default theme's hue (250) as the value of a per-theme token.
// - design-tables promising a sticky and a responsive table without showing them.
//
// Like `site-content` and `docs-language`, this reads files and starts nothing.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { removeElements } from '../../compiler/src/text-scan';

const ROOT = join(__dirname, '..', '..');
const PAGES = join(ROOT, 'compiler', 'demo', 'showcase-new', 'pages');
const MANIFEST = join(ROOT, 'ui', 'custom-elements.json');

const pages = readdirSync(PAGES).filter(f => f.endsWith('.pdx'));
/**
 * A page and the sections it composes: `sections/<page>/*.pdx` say what the page says,
 * so a claim moved into a section is still read here.
 */
const read = (f: string) => {
    const dir = join(PAGES, 'sections', f.replace(/\.pdx$/, ''));
    const sections = existsSync(dir)
        ? readdirSync(dir).filter(s => s.endsWith('.pdx')).sort().map(s => readFileSync(join(dir, s), 'utf8'))
        : [];
    return [readFileSync(join(PAGES, f), 'utf8'), ...sections].join('\n');
};

/** The page's markup, without its <script> and <style> blocks. */
function template(f: string): string {
    // Scanned, in any case and with `</script >` too: not two patterns that miss both (#72).
    return removeElements(removeElements(read(f), 'script'), 'style');
}

describe('the showcase galleries say only what is true and ours', () => {
    it('finds the pages at all', () => {
        // An empty directory would make every list below vacuously empty.
        expect(pages.length).toBeGreaterThan(100);
    });

    it('no page compares itself with named competitors', () => {
        const comparing = pages.filter(f => /competitor/i.test(read(f)));
        expect(comparing, 'these pages carry a competitor comparison or claim').toEqual([]);
    });

    it('no page puts an asterisk inside .pdx-field-required, which appends its own', () => {
        const doubled = pages.filter(f => /<span class="pdx-field-required">[^<\s][^<]*<\/span>/.test(read(f)));
        expect(doubled, 'these labels read "Name * *"').toEqual([]);
    });

    it('the breadcrumb reference gives the separator the default the component has', () => {
        const cem = JSON.parse(readFileSync(MANIFEST, 'utf8')) as {
            modules: { declarations: { tagName: string; members?: { name: string; default?: string }[] }[] }[];
        };
        const decl = cem.modules.flatMap(m => m.declarations).find(d => d.tagName === 'pdx-breadcrumb')!;
        const declared = decl.members!.find(m => m.name === 'separator')!.default;
        const row = /<td><code>separator<\/code><\/td><td>[^<]*<\/td><td>([^<]*)<\/td>/.exec(read('comp-breadcrumb.pdx'));
        expect(row, 'the Props table has no separator row').not.toBeNull();
        expect(row![1]).toBe(declared);
    });

    it('design-colors does not present one theme\'s hue as a per-theme token\'s value', () => {
        const rows = template('design-colors.pdx').split('\n')
            .filter(l => /<code>--pdx-(hue|color)-primary<\/code>/.test(l));
        expect(rows.length, 'the reference rows for the primary tokens are gone').toBe(2);
        for (const r of rows) {
            expect(r, 'a reference row names a hue number as the token value').not.toMatch(/\b250\b/);
            expect(r).toMatch(/per theme/);
        }
    });

    it('design-tables shows the sticky and responsive tables its intro promises', () => {
        const html = template('design-tables.pdx');
        // As a class on rendered markup, not only as a row of the reference.
        expect(html).toMatch(/<table class="[^"]*\bpdx-table-sticky\b/);
        expect(html).toMatch(/<div class="[^"]*\bpdx-table-responsive\b/);
    });

    it('design-tables sorts on aria-sort, the attribute assistive technology reads', () => {
        const html = template('design-tables.pdx');
        expect(html).toMatch(/<th aria-sort="ascending"/);
        expect(html).toMatch(/<th aria-sort="descending"/);
    });
});
