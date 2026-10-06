// One filename→tag rule, exported, and it gives a name the browser accepts.
//
// `App.pdx` must not compile to `component('pdx-App', …)`: a custom element name may not contain an
// uppercase letter, so `customElements.define` throws and the component never exists. Four other
// places derive the tag — the CLI's manifest and .d.ts, the LSP, the plugin's own-tag check — and
// one rule keeps any of them from lowercasing where the compiler does not.

import { describe, it, expect } from 'vitest';
import { deriveTag } from '../src/index';
import { compile } from '../src/plugin';

describe('deriveTag', () => {
    it('is exported, and lowercases: App.pdx → pdx-app', () => {
        expect(deriveTag('src/App.pdx')).toBe('pdx-app');
        expect(deriveTag('src\\pages\\UserCard.pdx')).toBe('pdx-usercard');
    });

    it('keeps the rules it had: a pdx- name, a special file with its parent', () => {
        expect(deriveTag('src/pdx-counter.pdx')).toBe('pdx-counter');
        expect(deriveTag('src/admin/_layout.pdx')).toBe('pdx-admin-layout');
        expect(deriveTag('src/pages/_layout.pdx')).toBe('pdx-layout');
    });

    it('the compiled component registers a valid element name', () => {
        const { code } = compile('<template><p>x</p></template>\n', '/app/src/App.pdx');
        expect(code).toContain("component('pdx-app'");
    });
});
