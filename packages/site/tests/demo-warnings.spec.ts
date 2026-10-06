/**
 * The galleries the site builds compile without a warning.
 *
 * A compiler warning on a gallery is a demo that shows something the component does not do, or code
 * a reader would copy: sizes xs/xl that pdx-input, pdx-button and pdx-select do not have,
 * `type="date"` on pdx-input, a form with no handleSubmit, a raw `${true}`, refs never used.
 *
 * It checks what the build compiles — src/demos/ as the suite's web server just generated it, and the
 * site-authored pages — as the build compiles them: compile() with the UI manifest's props and enum
 * values. Node-side: no browser.
 */
import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { compile } from '../../compiler/src/plugin';
import { ComponentResolver } from '../../compiler/src/component-resolver';
import { designHeuristics } from '../../compiler/src/compiler/design-heuristics';
import { applyIgnores } from '../../compiler/src/compiler/ignores';

const DIRS = ['../src/demos/', '../src/demos-authored/'].map((d) => fileURLToPath(new URL(d, import.meta.url)));

test('the data-grid gallery warns about nothing, and its slot and typed cells render', async ({ page }) => {
    // HTML-string `format` functions, which the grid deprecates, warn twice on every one of its seven
    // tabs. The name column is the `col:name` slot, the status column a typed renderer.
    const warnings: string[] = [];
    page.on('console', (m) => { if (m.type() === 'warning' && /pdx-data-grid/.test(m.text())) warnings.push(m.text()); });
    await page.goto('/components/pdx-data-grid', { waitUntil: 'networkidle' });
    // The section the heading heads — its parent. A `section` filtered by what it contains also
    // matches an outer one wrapping every grid on the page.
    const section = page.locator('.cmp-gallery').getByRole('heading', { name: 'Slot Templates', exact: true }).locator('xpath=..');
    const firstRow = section.locator('pdx-data-grid').getByRole('row', { name: /Alice Johnson/ }).first();
    await expect(firstRow.locator('pdx-avatar')).toHaveCount(1);
    // The avatar's initials come from `alt`, the row's name — "?" is an avatar given nothing.
    await expect(firstRow.locator('pdx-avatar [role="img"]')).toHaveText('AJ');
    await expect(firstRow.locator('strong')).toHaveText('Alice Johnson');
    await expect(firstRow.locator('.pdx-dg-status.pdx-dg-status-success')).toHaveText('Active');
    expect(warnings).toEqual([]);
});

test('every gallery page compiles with no warning', () => {
    const resolver = new ComponentResolver();
    expect(resolver.registerUiManifest(), 'no UI manifest: the enum check would check nothing').toBe(true);

    const problems: string[] = [];
    let pages = 0;
    // At any depth: the sections a page composes are under `sections/<page>/`.
    const pdxIn = (dir: string, rel = ''): string[] => readdirSync(join(dir, rel), { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? pdxIn(dir, join(rel, e.name)) : e.name.endsWith('.pdx') ? [join(rel, e.name)] : []);
    for (const dir of DIRS) {
        for (const file of pdxIn(dir)) {
            pages++;
            const source = readFileSync(join(dir, file), 'utf8');
            // With the manifest's props, as the plugin compiles: a bound name that is not the prop's
            // (PDX_PROP_NAME_CASE, PDX_UNKNOWN_PROP) is a warning here too.
            // And its enum values: PDX_INVALID_ENUM_VALUE is compile()'s.
            const { warnings } = compile(source, file, [], undefined, {
                propsOf: (t) => resolver.propsOf(t),
                enumValues: (t, p) => resolver.enumValues(t, p),
            });
            for (const w of warnings) {
                problems.push(`${file} — ${w.code}: ${w.message}`);
            }
        }
    }
    expect(pages, 'no gallery pages found').toBeGreaterThan(100);
    expect(problems).toEqual([]);
});

/**
 * Every .pdx of the site writes its colours as tokens: the site's own palette in
 * `styles/site.css`, the design system's on the galleries. A colour written as a value is right in
 * one theme and wrong in the other. A literal that IS the content carries `pdx-ignore` with the reason.
 */
test('no colour is written as a value in the site', () => {
    const SRC = fileURLToPath(new URL('../src/', import.meta.url));
    const pdxFiles = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? pdxFiles(join(dir, e.name)) : e.name.endsWith('.pdx') ? [join(dir, e.name)] : []);
    const files = pdxFiles(SRC);
    expect(files.length, 'no site .pdx found').toBeGreaterThan(100);
    const literals: string[] = [];
    for (const file of files) {
        const source = readFileSync(file, 'utf8');
        const found = designHeuristics(source, file).filter((w) => w.code === 'PDX_COLOUR_LITERAL');
        // Unused is judged only for this rule's exemptions: this pass runs one check, and an exemption
        // for another — a cross-file PDX_REPEATED_LOGIC — is not unused because it did not look.
        const left = applyIgnores(source, found, { reportUnused: true }).warnings
            .filter((w) => w.code !== 'PDX_IGNORE_UNUSED' || w.message.includes(' PDX_COLOUR_LITERAL '));
        for (const w of left) {
            literals.push(`${file.slice(SRC.length).replace(/\\/g, '/')}:${w.line} ${w.code}`);
        }
    }
    expect(literals).toEqual([]);
});
