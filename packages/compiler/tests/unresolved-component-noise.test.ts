// A diagnostic drowned in its own false positives is not a diagnostic.
//
// `PDX_UNRESOLVED_COMPONENT` warns for any `<pdx-*>` tag the resolver cannot auto-import, and says
// "the custom element will not be registered". But the resolver answers a NARROWER question — "can
// I write an import for this?" — and there are two legitimate ways for a tag to work without one:
//
//   · the design system styles it. `packages/design/src/layout.css` declares `pdx-stack`, `pdx-row`,
//     `pdx-grid`, `pdx-center`, `pdx-cluster`, `pdx-split`, `pdx-container` and `pdx-spacer` as
//     ELEMENT selectors with an attribute API. Nothing to import, nothing to register — they are
//     CSS, like `.pdx-btn`;
//   · another @pdxui package defines it. `pdx-router-outlet` is `define()`d by @pdxui/router,
//     which the app imports itself.
//
// A third case looks like a gap and is not: `pdx-toggle-group` is `component()`-declared inside
// `pdx-toggle.ts`, a second component in one file. CONTRIBUTING.md names this failure first among
// the silent ones; a warning that fires wrongly makes it unreadable, which is the same as switching
// it off.
//
// This asserts BOTH halves. A fix that silences everything would be worse than the noise.

import { describe, it, expect, beforeAll } from 'vitest';
import { ComponentResolver } from '../src/component-resolver';

describe('PDX_UNRESOLVED_COMPONENT tells the real gaps from the false ones', () => {
    const r = new ComponentResolver();
    const ok = r.registerUiManifest();
    // The first tag outside the manifest makes the resolver scan every package's sources (130ms
    // here, measured). Under the hook's timeout, not inside the first test's 5s: under load the
    // same scan can take over 5s.
    beforeAll(() => { r.knownWithoutImport('pdx-warm-the-scan'); });

    it('has a populated resolver to reason about', () => {
        // Without this the assertions below could pass on an empty registry.
        expect(ok).toBe(true);
        expect(r.size).toBeGreaterThan(90);
    });

    it('does not flag an element the design system styles', () => {
        // These are CSS-only custom elements. `/design/layout` uses them today and the page works;
        // packages/design has 263 tests over their behaviour.
        for (const tag of ['pdx-split', 'pdx-center', 'pdx-container', 'pdx-cluster', 'pdx-stack', 'pdx-grid', 'pdx-spacer']) {
            expect(r.knownWithoutImport(tag), `${tag} is styled by the design system, not missing`).toBe(true);
        }
    });

    it('does not flag an element another @pdxui package defines', () => {
        // Defined by @pdxui/router, which an app imports directly.
        expect(r.knownWithoutImport('pdx-router-outlet'),
            'pdx-router-outlet is defined by @pdxui/router').toBe(true);
    });

    it('finds a second component declared in the same file as another', () => {
        // `pdx-toggle-group` is `component()`-declared inside `pdx-toggle.ts`. `gen-manifest.mjs`
        // reads every component() in a file, so the manifest lists it and it resolves to its
        // sibling's export: one module, two tags.
        expect(r.knownWithoutImport('pdx-toggle-group'), 'declared by component() in pdx-toggle.ts').toBe(true);
        expect(r.resolve('pdx-toggle-group')?.importPath, 'shares its sibling module export')
            .toBe('@pdxui/ui/toggle');
    });

    it('STILL flags a tag that exists nowhere — the half that must not be lost', () => {
        // Without this the fix could become "never warn", which is worse than the noise: the point
        // of the diagnostic is the tag that really is missing.
        for (const tag of ['pdx-not-a-real-component', 'pdx-definitely-absent']) {
            expect(r.knownWithoutImport(tag), `${tag} exists nowhere and must still be reported`).toBe(false);
            expect(r.has(tag), `${tag} must not be auto-importable either`).toBe(false);
        }
    });

    it('does not confuse "known without import" with "auto-importable"', () => {
        // A CSS-only element must NOT gain an import — that is what would break it, since there is
        // no module to import. The two questions stay separate.
        expect(r.has('pdx-split'), 'a CSS-only element must not become an auto-import').toBe(false);
        expect(r.resolve('pdx-split'), 'and must not resolve to a module').toBeNull();
        // While a real component is both.
        expect(r.has('pdx-button')).toBe(true);
        expect(r.knownWithoutImport('pdx-button'), 'a real component is known, however it is asked').toBe(true);
    });
});
