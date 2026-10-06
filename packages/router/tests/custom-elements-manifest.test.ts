// The router's Custom Elements Manifest is hand-written (two elements, defined as classes), so this
// holds it against the sources: every element the router defines is in it, and every attribute it
// documents is one the element reads. It is what makes <pdx-router-outlet> and <pdx-link> known to
// the compiler and the editor.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const manifest = JSON.parse(readFileSync(join(ROOT, 'custom-elements.json'), 'utf-8')) as {
    modules: { path: string; declarations: { tagName: string; attributes?: { name: string }[] }[] }[];
};
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8')) as { customElements?: string; files?: string[] };

describe('the router manifest', () => {
    it('is the one package.json names, and ships', () => {
        expect(pkg.customElements).toBe('custom-elements.json');
        expect(pkg.files).toContain('custom-elements.json');
    });

    it('lists exactly the elements the sources define', () => {
        const defined = new Set<string>();
        for (const file of readdirSync(join(ROOT, 'src')).filter(f => f.endsWith('.ts'))) {
            const text = readFileSync(join(ROOT, 'src', file), 'utf-8');
            for (const m of text.matchAll(/customElements\.define\(\s*['"]([\w-]+)['"]/g)) defined.add(m[1]);
        }
        const listed = manifest.modules.flatMap(m => m.declarations.map(d => d.tagName));
        expect([...listed].sort()).toEqual([...defined].sort());
    });

    // What the site, the skills and llms.txt need to list an element beside the library's: its
    // category, its place after the library's last, and the one line that says what it is for
    // Without them the site's reader throws, and the elements appear nowhere.
    it('gives each element a category, an order after the library, and a summary', () => {
        const ui = JSON.parse(readFileSync(join(ROOT, '..', 'ui', 'custom-elements.json'), 'utf-8')) as {
            modules: { declarations?: { order?: number }[] }[];
        };
        const lastOfUi = Math.max(...ui.modules.flatMap(m => m.declarations ?? []).map(d => d.order ?? 0));
        const decls = manifest.modules.flatMap(m => m.declarations) as unknown as { tagName: string; category?: unknown; order?: unknown; summary?: unknown }[];
        for (const d of decls) {
            expect(d.category, d.tagName).toBe('Navigation');
            expect(typeof d.order === 'number' && d.order > lastOfUi, `${d.tagName} order after ${lastOfUi}`).toBe(true);
            expect(typeof d.summary === 'string' && d.summary.split(/\s+/).length >= 5, `${d.tagName} summary`).toBe(true);
        }
        expect(new Set(decls.map(d => d.order)).size, 'two elements share an order').toBe(decls.length);
    });

    it('documents only attributes the element reads, from the module it names', () => {
        for (const mod of manifest.modules) {
            expect(existsSync(join(ROOT, mod.path)), mod.path).toBe(true);
            const source = readFileSync(join(ROOT, mod.path), 'utf-8');
            for (const decl of mod.declarations) {
                for (const attr of decl.attributes ?? []) {
                    expect(source, `<${decl.tagName}> ${attr.name}`).toMatch(new RegExp(`(?:get|has)Attribute\\('${attr.name}'\\)`));
                }
            }
        }
    });
});
