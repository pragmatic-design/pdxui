// The runtime's scans of markup and patterns take linear time on the inputs CodeQL names.
//
// Each was a regex that ran in polynomial time on a crafted input (#67, code scanning alerts #24,
// #25): html``'s self-closing expansion, and the form schema's nested-quantifier heuristic, which
// reads a pattern from an untrusted schema. Measured here, alone, where a clock means something;
// before the scans, the two html`` cases took 1.3 s and 4 s on this machine.

import { describe, it, expect } from 'vitest';
import { html } from '../../src/renderer/template';
import { isRiskyPattern } from '../../src/form/form-schema';
import { resolveColorToken } from '../../../design/src/engine/color';
import { guardThemeRules } from '../../../design/src/engine/nested-theme-guard';
import { isSelfContainedType } from '../../../lsp/src/utils/payload-type';

function elapsed(fn: () => void): number {
    const start = performance.now();
    fn();
    return performance.now() - start;
}

/** A TemplateStringsArray of one string, as a tagged literal would hand html``. */
const template = (markup: string) => Object.assign([markup], { raw: [markup] }) as unknown as TemplateStringsArray;

describe('linear scans', () => {
    for (const [label, markup] of [
        ['an unclosed quote after every <', '<A"' + '"<A"'.repeat(20_000)],
        ['a run of whitespace in a tag', '<A' + '\t'.repeat(100_000)],
    ] as const) {
        it(`html\`\` self-closing expansion: ${label}`, () => {
            const ms = elapsed(() => html(template(markup)));
            console.log(`  ⏱ html\`\`, ${label}: ${ms.toFixed(1)} ms`);
            expect(ms, `${markup.length} characters`).toBeLessThan(300);
        });
    }

    for (const [label, source] of [
        ['a run of (', '('.repeat(200_000)],
        ['( then a run of *', '(*' + '*'.repeat(200_000)],
    ] as const) {
        it(`isRiskyPattern: ${label}`, () => {
            const ms = elapsed(() => isRiskyPattern(source));
            console.log(`  ⏱ isRiskyPattern, ${label}: ${ms.toFixed(1)} ms`);
            expect(ms).toBeLessThan(100);
        });
    }

    // The design engine and the language server (alerts #26–#29, #31). Before the scans: the old
    // var() regex had not finished on 30,000 tabs after five minutes, and the payload regex is
    // exponential in a run of digits.
    it('resolveColorToken: a var( followed by a run of tabs', () => {
        const ms = elapsed(() => resolveColorToken({ '--a': 'var(---,' + '\t'.repeat(30_000) }, '--a', 'light'));
        console.log(`  ⏱ resolveColorToken, var( + tabs: ${ms.toFixed(1)} ms`);
        expect(ms).toBeLessThan(100);
    });

    it('guardThemeRules: a selector list with a long run of whitespace', () => {
        const css = `.a${' '.repeat(30_000)}x { color: red; }`;
        const ms = elapsed(() => guardThemeRules(css, 'x'));
        console.log(`  ⏱ guardThemeRules, whitespace: ${ms.toFixed(1)} ms`);
        expect(ms).toBeLessThan(200);
    });

    it('isSelfContainedType: a run of digits that ends in a name', () => {
        const ms = elapsed(() => isSelfContainedType('0'.repeat(100_000) + 'X'));
        console.log(`  ⏱ isSelfContainedType, digits: ${ms.toFixed(1)} ms`);
        expect(ms).toBeLessThan(100);
    });
});
