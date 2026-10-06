// `--pdx-color-subtle` is not a text colour, and nothing in the design system may use it as one.
//
// Subtle is the tertiary grey — gray-400 in light, gray-600 in dark. It is meant for borders,
// dividers, decorative glyphs and fills, and it measures 2.07–2.89:1 against the page in all 13
// themes × 2 schemes: every piece of text painted with it fails WCAG 1.4.3 (4.5:1). The token
// contrast gate does not catch such a use — `.pdx-ink-subtle`, a blockquote's `cite`, the nav
// heading, the breadcrumb separator — because it measures the text tokens (`*-ink`, muted) and
// subtle is not one of them.
//
// This lives in core, like the other cross-package CSS contracts (design-tokens, design-exports):
// `packages/design`'s own `test` script is Playwright, and this needs to read files, not a browser.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DESIGN_SRC = join(__dirname, '..', '..', 'design', 'src');

/** The `color` property only: `border-color`, `background-color`, `fill` and friends are the
 *  legitimate uses, and the character before `color` is what separates them. */
const TEXT_COLOR_SUBTLE = /(?:^|[\s;{])color\s*:\s*[^;}]*--pdx-color-subtle/;

function cssFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? cssFiles(join(dir, e.name)) : e.name.endsWith('.css') ? [join(dir, e.name)] : [],
    );
}

/** `file:line` for every `color:` declaration that reads subtle. */
function textUsesOfSubtle(): string[] {
    const found: string[] = [];
    for (const file of cssFiles(DESIGN_SRC)) {
        const rel = file.slice(DESIGN_SRC.length + 1).replace(/\\/g, '/');
        readFileSync(file, 'utf-8').split(/\r?\n/).forEach((line, i) => {
            if (TEXT_COLOR_SUBTLE.test(line)) found.push(`${rel}:${i + 1}`);
        });
    }
    return found;
}

describe('the subtle token is never a text colour', () => {
    it('scanned the design system, not an empty tree', () => {
        // Without this the assertion below would pass on a wrong path — an empty scan looks clean.
        expect(cssFiles(DESIGN_SRC).length).toBeGreaterThan(40);
    });

    it('no `color:` declaration in packages/design/src reads --pdx-color-subtle', () => {
        expect(
            textUsesOfSubtle(),
            'subtle measures 2.07–2.89:1 on the page: text painted with it fails WCAG 1.4.3. Use --pdx-color-muted.',
        ).toEqual([]);
    });
});

describe('the scan itself', () => {
    it('flags a text colour', () => {
        expect(TEXT_COLOR_SUBTLE.test('    color: var(--pdx-color-subtle);')).toBe(true);
        expect(TEXT_COLOR_SUBTLE.test('.a { color: var(--pdx-color-subtle); }')).toBe(true);
    });

    it('leaves the non-text properties alone — those are what subtle is for', () => {
        expect(TEXT_COLOR_SUBTLE.test('    border-color: var(--pdx-color-subtle);')).toBe(false);
        expect(TEXT_COLOR_SUBTLE.test('    background-color: var(--pdx-color-subtle);')).toBe(false);
        expect(TEXT_COLOR_SUBTLE.test('    border-bottom: 1px solid var(--pdx-color-subtle);')).toBe(false);
    });
});
