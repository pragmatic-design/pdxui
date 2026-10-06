// `__adoptStyles` — a shadow component's CSS, put where the component can see it.
//
// The light-DOM path appends a `<style>` to `document.head`, and a document stylesheet does not
// cross a shadow boundary. A `<template shadow>` component whose styles went to the head would render
// unstyled: every piece individually correct, the combination impossible, and silent.
//
// The compiler emits a call to this for every shadow component, so what it has to get right is
// sharing (one sheet, many instances), updating (an HMR pass must reach the roots that already
// adopted it) and not doing the work twice.

import { describe, it, expect, beforeEach } from 'vitest';
import { __adoptStyles } from '../src/component/style';

/** A fresh host with an open shadow root. */
function root(): ShadowRoot {
    const host = document.createElement('div');
    document.body.appendChild(host);
    return host.attachShadow({ mode: 'open' });
}

/** The CSS a root carries, however it carries it. */
function cssOf(r: ShadowRoot): string {
    const adopted = (r as unknown as { adoptedStyleSheets?: CSSStyleSheet[] }).adoptedStyleSheets ?? [];
    const fromSheets = adopted.flatMap(s => [...s.cssRules].map(rule => rule.cssText)).join(' ');
    const fromElements = [...r.querySelectorAll('style')].map(s => s.textContent).join(' ');
    return (fromSheets + ' ' + fromElements).trim();
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('adopting a stylesheet into a shadow root', () => {
    it('puts the CSS in the root, not in the document head', () => {
        const headBefore = document.head.querySelectorAll('style').length;
        const r = root();
        __adoptStyles(r, '.inside { color: red; }', 'a1');

        expect(cssOf(r)).toContain('.inside');
        expect(document.head.querySelectorAll('style').length, 'it reached the head instead')
            .toBe(headBefore);
    });

    it('shares one sheet between every instance of the same component', () => {
        const a = root();
        const b = root();
        __adoptStyles(a, '.x { color: red; }', 'shared');
        __adoptStyles(b, '.x { color: red; }', 'shared');

        const sheetsOf = (r: ShadowRoot): CSSStyleSheet[] =>
            (r as unknown as { adoptedStyleSheets: CSSStyleSheet[] }).adoptedStyleSheets;
        expect(sheetsOf(a)[0], 'a hundred rows would build a hundred sheets').toBe(sheetsOf(b)[0]);
    });

    it('does not adopt the same sheet twice into one root', () => {
        const r = root();
        __adoptStyles(r, '.x { color: red; }', 'twice');
        __adoptStyles(r, '.x { color: red; }', 'twice');

        const sheets = (r as unknown as { adoptedStyleSheets: CSSStyleSheet[] }).adoptedStyleSheets;
        expect(sheets).toHaveLength(1);
    });

    it('an HMR pass with new CSS reaches a root that already adopted it', () => {
        const r = root();
        __adoptStyles(r, '.x { color: red; }', 'hmr');
        // The same id, new content: the shared sheet is replaced in place, which is the point of
        // sharing it — every instance updates at once and none has to re-adopt.
        __adoptStyles(r, '.x { color: blue; }', 'hmr');

        expect(cssOf(r)).toContain('blue');
        expect(cssOf(r)).not.toContain('red');
    });

    it('is a no-op when there is no root to adopt into', () => {
        expect(() => __adoptStyles(null, '.x { color: red; }', 'none')).not.toThrow();
        expect(() => __adoptStyles(undefined, '.x { color: red; }', 'none')).not.toThrow();
    });
});
