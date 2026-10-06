// A generated theme declares none of the page's tokens unless its author asked for one.
//
// `tokens.css` declares the page's tokens once, in its root-only `:root` block: the motion scale,
// the durations, the type, z-index and max-width scales, the touch target. No shipped theme declares
// them, so an app's choice — and `adaptive.css`'s reduced-motion `--pdx-motion-scale: 0` — reaches
// the whole page. A saved theme sits in pdx.themes, after pdx.adaptive, so a `--pdx-motion-scale: 1`
// declared by createTheme() would beat the reduced-motion zero on <html>. The type scale is emitted
// only when asked, for the same reason (generate.ts).

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { createTheme, getLanguageIds } from '@pdxui/design/engine';

/** The custom properties of tokens.css's root-only block: the one whose selector is `:root` alone. */
function pageTokens(): string[] {
    const css = readFileSync(new URL('../../design/src/tokens.css', import.meta.url), 'utf8');
    const block = css.match(/^:root\s*\{([^}]*)\}/m);
    if (!block) throw new Error('tokens.css has no root-only `:root { … }` block');
    return [...block[1].matchAll(/(--pdx-[a-z0-9-]+)\s*:/g)].map((m) => m[1]);
}

describe('a generated theme leaves the page\'s tokens to the page', () => {
    const page = pageTokens();

    it('the root-only block is the one read: it holds the motion scale and the durations', () => {
        expect(page).toEqual(expect.arrayContaining(['--pdx-motion-scale', '--pdx-duration-base', '--pdx-text-base', '--pdx-z-modal']));
    });

    for (const language of getLanguageIds()) {
        it(`${language}: no page token is declared when the input sets none`, () => {
            const { tokens } = createTheme({ name: 'test', brandColor: '#1d4ed8', language });
            expect(Object.keys(tokens).filter((t) => page.includes(t))).toEqual([]);
        });
    }

    it('an author\'s motionScale is declared, as the author asked', () => {
        const css = createTheme({ name: 'test', brandColor: '#1d4ed8', language: 'neutral', motionScale: 0.5 }).toCSS();
        expect(css).toContain('--pdx-motion-scale: 0.5;');
    });
});
