// The dev console prints defects; a design-review question is printed only when asked for
// for. Printed by the dev server on every save, PDX_EFFECT_STATE (CD-D2, a heuristic) would repeat
// itself — six times for a single file of the site.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { compile } from '../src/plugin';

// The noteRecent shape of design-checks-data-flow.test.ts: a design finding (PDX_EFFECT_STATE)
// next to a defect (PDX_RAW_INTERPOLATION).
const SOURCE = [
    '<template><p title="${label}">{{ label }}</p></template>',
    '<script setup>',
    "let path = $signal('/');",
    'let recentsVersion = $signal(0);',
    'const label = $derived(recentsVersion);',
    '$watch(path, (p) => noteRecent(p));',
    'function noteRecent(p) {',
    "  localStorage.setItem('recent', p);",
    '  recentsVersion++;',
    '}',
    '</script>',
    '',
].join('\n');

describe('compile() logs the design category only when asked', () => {
    afterEach(() => vi.restoreAllMocks());

    const printed = (logDesign: boolean): string => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        compile(SOURCE, 'piece.pdx', [], undefined, { logWarnings: true, logDesign });
        return warn.mock.calls.map((c) => String(c[0])).join('\n');
    };

    it('by default: the defect, not the design question', () => {
        const out = printed(false);
        expect(out).toContain('${label}');
        expect(out).not.toContain('CD-D2');
    });

    it('with logDesign: both', () => {
        const out = printed(true);
        expect(out).toContain('${label}');
        expect(out).toContain('CD-D2');
    });

    it('the returned warnings carry both either way', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const codes = compile(SOURCE, 'piece.pdx').warnings.map((w) => w.code);
        expect(codes).toEqual(expect.arrayContaining(['PDX_EFFECT_STATE', 'PDX_RAW_INTERPOLATION']));
    });
});
