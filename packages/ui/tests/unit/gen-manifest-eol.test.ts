// custom-elements.json must not depend on the line endings of the machine that generated it.
//
// TypeScript hands back JSDoc prose with the source file's own terminators, so a multi-line
// description written on Windows arrives as `...no longer\r\nscrolls...` and on Linux as
// `...no longer\nscrolls...`. Those are two different JSON string VALUES — git's `text eol=lf`
// cannot normalise them, because to git they are content, not line endings. The consequence is a
// manifest that changes depending on who built it last, and prop descriptions that reach an agent
// with a carriage return in the middle of a sentence.
//
// The test is on the GENERATOR rather than on the committed file, and that distinction is the whole
// point: an assertion over `custom-elements.json` alone is green on any Linux box even with a
// generator that does not normalise, so it would measure the platform rather than the code. `analyzeFile` is fed
// CRLF source here, on every platform, and must return LF.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error — plain .mjs build script, no type declarations by design
import { analyzeFile } from '../../scripts/gen-manifest.mjs';

/** Every string anywhere in a JSON-ish value, with the path that reaches it. */
function strings(value: unknown, path = ''): Array<{ path: string; text: string }> {
    if (typeof value === 'string') return [{ path, text: value }];
    if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, `${path}[${i}]`));
    if (value && typeof value === 'object') {
        return Object.entries(value).flatMap(([k, v]) => strings(v, path ? `${path}.${k}` : k));
    }
    return [];
}

// A component written on a Windows checkout: CRLF throughout, and two multi-line JSDoc blocks —
// one on the component() statement, one on a prop — which is exactly where a real manifest
// picks its carriage returns up.
const CRLF_SOURCE = [
    '/**',
    ' * A widget whose description runs onto',
    ' * a second line.',
    ' *',
    ' * @slot header - Header content that also wraps',
    ' * onto a second line.',
    ' * @fires pdx-change - Fired when the value changes and this',
    ' * sentence continues below.',
    ' */',
    "component('pdx-widget', {",
    '    props: {',
    '        /**',
    '         * Fill the parent height instead of growing with content. The page no longer',
    '         * scrolls — only the body does.',
    '         */',
    "        fill: { type: Boolean, default: false },",
    '    },',
    '});',
].join('\r\n');

describe('gen-manifest normalises line endings so the manifest is reproducible', () => {
    it('returns no carriage return anywhere, given CRLF source', () => {
        // The control: if the fixture ever loses its CRLF, the assertion below would pass by
        // measuring nothing. An input without \r cannot demonstrate normalisation.
        expect(CRLF_SOURCE, 'the fixture must actually carry CRLF').toContain('\r\n');

        const mod = analyzeFile('src/widget/pdx-widget.ts', CRLF_SOURCE, {})[0];  // returns every component in the file
        // Second control: a fixture the extractor does not recognise returns null, and `strings(null)`
        // is an empty list — which would also satisfy "no carriage returns".
        expect(mod, 'the fixture must be recognised as a component').not.toBeNull();

        const decl = mod.declarations[0];
        expect(decl.tagName).toBe('pdx-widget');
        expect(decl.description, 'the multi-line description must survive').toContain('second line');

        const offenders = strings(mod).filter(s => s.text.includes('\r'));
        expect(offenders, 'these values carry a carriage return').toEqual([]);
    });

    it('keeps the line break itself — normalising is not flattening', () => {
        // \r\n → \n, not \r\n → ''. A description whose newlines were stripped would pass the
        // assertion above while quietly losing the author's paragraphing.
        const mod = analyzeFile('src/widget/pdx-widget.ts', CRLF_SOURCE, {})[0];  // returns every component in the file
        expect(mod.declarations[0].description).toContain('\n');
    });
});

describe('the committed custom-elements.json is free of carriage returns', () => {
    // The state-based half. Weak on its own — green on Linux regardless — but it is what catches a
    // manifest committed from a machine that ran an older generator.
    const manifestPath = join(__dirname, '../../custom-elements.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

    it('carries the components it is supposed to carry', () => {
        // Without this, an empty or truncated manifest would satisfy the assertion below.
        expect(manifest.modules.length).toBeGreaterThan(100);
    });

    it('has no string value containing \\r', () => {
        const offenders = strings(manifest.modules).filter(s => s.text.includes('\r'));
        expect(offenders.map(o => o.path), 'these values carry a carriage return').toEqual([]);
    });
});
