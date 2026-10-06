// A component's stylesheet travels with the component.
//
// A `base.css` that carried every component's CSS would make an app that renders two of them
// download the styles of all 114: 28.8 KB gzipped on the showcase, more than its entire JavaScript
// bundle, and render-blocking.
//
// So each component imports its own — `pdx-data-grid.ts` imports
// `@pdxui/design/components/data-grid` — and the app ships the styles of what it renders.
//
// ⚠️ THE FAILURE THIS GUARDS IS SILENT AND PRODUCTION-ONLY: a component whose import is missing
// renders unstyled, and nothing throws. `pnpm certify` is the real proof — it measures every
// component's geometry across 13 themes from pages that get their CSS from the modules — but
// certify is minutes and this is milliseconds, and it names the file rather than the pixel.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(__dirname, '..', '..', '..');
const DESIGN = join(REPO, 'packages', 'design');
const UI_SRC = join(REPO, 'packages', 'ui', 'src');
const LAYERED = join(DESIGN, 'src', 'components', 'layered');

/** The stylesheets that belong to a component, by name. */
const owned = readdirSync(LAYERED).filter(f => f.endsWith('.css')).map(f => f.replace(/\.css$/, '')).sort();

/** Component directories under ui/src that hold a `pdx-<dir>.ts`. */
const uiDirs = readdirSync(UI_SRC).filter(d => existsSync(join(UI_SRC, d, `pdx-${d}.ts`))).sort();

const sourceOf = (dir: string): string => readFileSync(join(UI_SRC, dir, `pdx-${dir}.ts`), 'utf-8');

describe('the scan has something to scan', () => {
    it('found the component stylesheets and the components', () => {
        expect(owned.length, 'no layered component entries — run scripts/gen-layered-entries.mjs').toBeGreaterThan(50);
        expect(uiDirs.length, 'no component sources found').toBeGreaterThan(90);
    });
});

describe('every component that owns a stylesheet imports it', () => {
    for (const name of owned) {
        if (!existsSync(join(UI_SRC, name, `pdx-${name}.ts`))) continue;
        it(`pdx-${name}`, () => {
            expect(sourceOf(name), `pdx-${name}.ts does not import its own stylesheet — it renders unstyled in an app that takes @pdxui/design/base`)
                .toContain(`@pdxui/design/components/${name}'`);
        });
    }
});

describe('no component stylesheet is left with nobody to carry it', () => {
    /**
     * The other direction. `every component that owns a stylesheet imports it` catches a component
     * that lost its CSS; this catches a stylesheet that lost its component — a file still shipped
     * in `@pdxui/design/components` and reachable from no module, which is dead weight for the
     * app that takes the whole set and nothing at all for the app that does not.
     */
    it('every layered entry is imported by some component', () => {
        const sources = uiDirs.map(sourceOf).join('\n');
        const orphans = owned.filter(name => !sources.includes(`@pdxui/design/components/${name}'`));
        expect(orphans, 'these stylesheets are reachable from no component').toEqual([]);
    });

    /**
     * A handful of components own no stylesheet and have their classes written in another's file —
     * `.pdx-form-template-content` lives in form.css, where the form is. Their imports are in the
     * source with the reason next to them.
     *
     * Deriving that set precisely is harder than it looks: distinguishing "this file styles the
     * component" from "this file styles something INSIDE the component" needs real selector
     * analysis, and a cheap approximation is wrong in one direction or the other — it can have
     * `pdx-input` pulling in autocomplete.css and select.css, 16 KB for every app with a text
     * field. So the exact statement is not made here.
     *
     * The proof for that set is `pnpm certify`: 6263 geometric measurements, every component, 13
     * themes, from scenario pages that get their CSS from the modules they import. A component
     * whose styles do not travel fails a min-height or a radius there, loudly.
     */
    it('the components with no stylesheet of their own say where theirs comes from', () => {
        for (const dir of ['field-group', 'field-list', 'form-actions', 'form-section', 'form-template']) {
            expect(sourceOf(dir), `pdx-${dir}'s classes are written in form.css and it does not import it`)
                .toContain(`@pdxui/design/components/form'`);
        }
        expect(sourceOf('edit-drawer')).toContain(`@pdxui/design/components/drawer'`);
    });

    /**
     * The dialog queue's outlet draws with the dialog's classes, and its file is not named after its
     * directory (`overlay/pdx-overlay-outlet.ts`), so the scan above never sees it. Without its own
     * import, its modal is styled only where some OTHER component has brought dialog.css — a grid, a
     * field group, a `pdx-dialog`. On a page holding the outlet alone: the backdrop `static`, 107px of
     * text and two buttons at the top of the page, nothing covered.
     */
    /**
     * `.pdx-chip` is drawn by chip.css, and a tag input or a multi-select draws its tags with it.
     * Without importing chip.css, their tags are styled only where a `pdx-chip` elsewhere on the page
     * has brought it. On the contract page, which holds the tag input alone: "react × vue ×" as plain
     * text, in 13 themes. Derived from the sources, so a new component that renders a chip is held
     * to it too.
     */
    it('every component that renders .pdx-chip carries chip.css', () => {
        const renders = uiDirs.filter(d => d !== 'chip' && /class="[^"]*\bpdx-chip\b(?!-)/.test(sourceOf(d)));
        expect(renders.length, 'no component renders a chip — the scan is not reading the sources').toBeGreaterThan(0);
        const missing = renders.filter(d => !sourceOf(d).includes(`@pdxui/design/components/chip'`));
        expect(missing, 'these render .pdx-chip and do not import chip.css').toEqual([]);
    });

    /**
     * The same failure twice more, visible on scenario pages that do not import the barrel:
     * pdx-split-button builds its menu with `.pdx-menu-item` (drawn by menu.css) and pdx-drawer's ✕
     * is a `.pdx-dialog-close` (drawn by dialog.css). Without the sheet, on a page holding each
     * alone: the split button's items 25.6px tall instead of 32, the drawer's close 24×28.8 instead
     * of 32×32. A class written in a template OR assigned from
     * code (`btn.className = 'pdx-menu-item'`) counts.
     */
    for (const [cls, sheet] of [['pdx-menu-item', 'menu'], ['pdx-dialog-close', 'dialog']] as const) {
        it(`every component that renders .${cls} carries ${sheet}.css`, () => {
            const uses = new RegExp(`(?:class="[^"]*|className\\s*=\\s*'[^']*)\\b${cls}\\b(?!-)`);
            const renders = uiDirs.filter(d => d !== sheet && uses.test(sourceOf(d)));
            expect(renders.length, `no component renders .${cls} — the scan is not reading the sources`).toBeGreaterThan(0);
            const missing = renders.filter(d => !sourceOf(d).includes(`@pdxui/design/components/${sheet}'`));
            expect(missing, `these render .${cls} and do not import ${sheet}.css`).toEqual([]);
        });
    }

    it('the dialog queue\'s outlet carries the dialog\'s stylesheet', () => {
        const outlet = readFileSync(join(UI_SRC, 'overlay', 'pdx-overlay-outlet.ts'), 'utf-8');
        expect(outlet, 'pdx-overlay-outlet draws .pdx-dialog-* and does not import dialog.css')
            .toContain(`@pdxui/design/components/dialog'`);
    });
});

describe('the package can be asked for each of them', () => {
    const pkg = JSON.parse(readFileSync(join(DESIGN, 'package.json'), 'utf-8')) as {
        exports: Record<string, string | Record<string, string>>;
    };

    it('every layered entry has an exports sub-path', () => {
        const missing = owned.filter(n => !(`./components/${n}` in pkg.exports));
        expect(missing, 'these stylesheets exist and no sub-path resolves to them').toEqual([]);
    });

    it('and every sub-path lands in the components layer', () => {
        for (const name of owned) {
            const css = readFileSync(join(LAYERED, `${name}.css`), 'utf-8');
            expect(css, `${name} does not declare the layer order`).toContain('@layer pdx.reset,');
            expect(css, `${name} is imported without a layer — its rules would beat the consumer`)
                .toContain('layer(pdx.components)');
        }
    });

    /**
     * The entries are GENERATED from base.css's layer order by `pnpm build`, and nothing in the gate
     * runs the build: a layer added to base.css leaves the committed entries on the old order until
     * something builds the tree from scratch. An entry imported alone declares the order, so a stale
     * one is the order the app gets.
     */
    it('every entry declares the layer order base.css declares today', () => {
        const order = readFileSync(join(DESIGN, 'src', 'base.css'), 'utf-8').split(/\r?\n/).find(l => l.startsWith('@layer '));
        expect(order, 'base.css declares no layer order').toBeTruthy();
        const dirs = [LAYERED, join(DESIGN, 'src', 'themes', 'layered')];
        const stale = dirs.flatMap(d => readdirSync(d).filter(f => f.endsWith('.css'))
            .filter(f => !readFileSync(join(d, f), 'utf-8').split(/\r?\n/).includes(order as string)).map(f => f));
        expect(stale, 'stale: run `node packages/design/scripts/gen-layered-entries.mjs` and commit').toEqual([]);
    });

    it('base.css keeps the CSS-only tier and nothing else', () => {
        const base = readFileSync(join(DESIGN, 'src', 'base.css'), 'utf-8');
        for (const shared of ['table', 'nav', 'code', 'feedback']) {
            expect(base, `base.css dropped ${shared}.css — nothing else carries it`)
                .toContain(`./components/${shared}.css`);
        }
        expect(base, 'base.css imports every component stylesheet again — the split buys nothing')
            .not.toContain('components/_all.css');
    });
});
