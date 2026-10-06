// A declared exemption for one finding: `pdx-ignore CODE: reason`.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { designHeuristics } from '../src/compiler/design-heuristics';
import { applyIgnores, parseIgnores } from '../src/compiler/ignores';

const codes = (src: string): string[] => compile(src, 'x.pdx').warnings.map((w) => w.code);

describe('pdx-ignore, the next line', () => {
    it('in the template: silences that code on the next line, and only there', () => {
        const src = [
            '<template>',
            '  <!-- pdx-ignore PDX_RAW_INTERPOLATION: the page shows the raw form on purpose -->',
            '  <p title="${a}">x</p>',
            '  <p title="${b}">y</p>',
            '</template>',
            '<script setup>',
            'let a = $signal(1);',
            'let b = $signal(2);',
            '</script>',
        ].join('\n');
        const raw = compile(src, 'x.pdx').warnings.filter((w) => w.code === 'PDX_RAW_INTERPOLATION');
        expect(raw.map((w) => w.line)).toEqual([4]);
    });

    it('in the script: // pdx-ignore', () => {
        const src = '<template><p>{{ count }}</p></template>\n<script setup>\n// pdx-ignore PDX_NON_REACTIVE: read once, on purpose\nlet count = 0;\nfunction bump() { count = count + 1; }\n</script>\n';
        expect(codes(src)).not.toContain('PDX_NON_REACTIVE');
    });

    it('in a style: /* pdx-ignore */', () => {
        const src = '<template><p class="y">x</p></template>\n<script setup>\nlet a = $signal(1);\n</script>\n<style scoped>\n/* pdx-ignore PDX_GLOBAL_SELECTOR: the demo shows what the browser drops */\n:global(.x) .y { margin: 0; }\n</style>\n';
        expect(codes(src)).not.toContain('PDX_GLOBAL_SELECTOR');
    });

    it('the control: the same files without the comment give the finding', () => {
        expect(codes('<template><p>{{ count }}</p></template>\n<script setup>\nlet count = 0;\nfunction bump() { count = count + 1; }\n</script>\n')).toContain('PDX_NON_REACTIVE');
    });
});

describe('pdx-ignore-file', () => {
    it('silences that code on every line of the file', () => {
        const src = [
            '<template>',
            '  <!-- pdx-ignore-file PDX_RAW_INTERPOLATION: a page about the raw form -->',
            '  <p title="${a}">x</p>',
            '  <p>filler</p>',
            '  <p title="${b}">y</p>',
            '</template>',
            '<script setup>',
            'let a = $signal(1);',
            'let b = $signal(2);',
            '</script>',
        ].join('\n');
        expect(codes(src)).not.toContain('PDX_RAW_INTERPOLATION');
    });
});

describe('an exemption must say why', () => {
    it('without a reason it is an error, and exempts nothing', () => {
        const src = '<template>\n  <!-- pdx-ignore PDX_RAW_INTERPOLATION -->\n  <p title="${a}">x</p>\n</template>\n<script setup>\nlet a = $signal(1);\n</script>\n';
        const ws = compile(src, 'x.pdx').warnings;
        expect(ws.find((w) => w.code === 'PDX_IGNORE_WITHOUT_REASON')).toMatchObject({ severity: 'error', line: 2 });
        expect(ws.map((w) => w.code)).toContain('PDX_RAW_INTERPOLATION');
    });

    it('a colon with nothing after it is no reason either', () => {
        expect(parseIgnores('<!-- pdx-ignore PDX_X:   -->')).toMatchObject([{ code: 'PDX_X', reason: '' }]);
    });
});

describe('an exemption that silences nothing', () => {
    const src = '<template>\n  <!-- pdx-ignore PDX_RAW_INTERPOLATION: was here once -->\n  <p>x</p>\n</template>\n<script setup>\nlet a = $signal(1);\n</script>\n';

    it('is PDX_IGNORE_UNUSED when every check ran', () => {
        const r = applyIgnores(src, [], { reportUnused: true });
        expect(r.warnings).toMatchObject([{ code: 'PDX_IGNORE_UNUSED', line: 2 }]);
    });

    it('is not reported by compile(), which does not run every check', () => {
        expect(codes(src)).not.toContain('PDX_IGNORE_UNUSED');
    });
});

// The case the story was written for: a colour literal that IS the content of a demo.
describe('a palette swatch', () => {
    it('/* pdx-ignore PDX_COLOUR_LITERAL: swatch */ silences the literal, and counts as one ignored', () => {
        const src = [
            '<template><div class="swatch">red</div></template>',
            '<script setup>',
            'let a = $signal(1);',
            '</script>',
            '<style scoped>',
            '.swatch {',
            '  /* pdx-ignore PDX_COLOUR_LITERAL: swatch */',
            '  background: #e11d48;',
            '}',
            '</style>',
        ].join('\n');
        const found = designHeuristics(src, 'x.pdx');
        expect(found.map((w) => w.code), 'the fixture must draw the finding').toContain('PDX_COLOUR_LITERAL');
        const r = applyIgnores(src, found, { reportUnused: true });
        expect(r.warnings.map((w) => w.code)).not.toContain('PDX_COLOUR_LITERAL');
        expect(r.warnings.map((w) => w.code)).not.toContain('PDX_IGNORE_UNUSED');
        expect(r.ignored).toBe(1);
    });
});
