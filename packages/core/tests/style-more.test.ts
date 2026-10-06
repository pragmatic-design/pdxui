// The style runtime — cssVar, the token bridge, and the theme manager.
//
// The theme manager keeps its state in module-level signals AND in localStorage AND in attributes
// on <html>: three copies of one fact. Most of what is worth asserting here is that they agree.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    cssVar, createTokenBridge, createTheme, applyTheme,
    setTheme, setScheme, getTheme, getScheme, toggleDarkMode,
    currentTheme, currentScheme,
} from '../src/component/style';
import { effect } from '../src/reactivity/signal';

const root = () => document.documentElement;

/** Put real CSS on the page so getComputedStyle has something to resolve. */
function styleSheet(css: string): HTMLStyleElement {
    const el = document.createElement('style');
    el.textContent = css;
    document.head.appendChild(el);
    return el;
}

beforeEach(() => {
    localStorage.clear();
    for (const a of ['pdx-theme', 'pdx-scheme', 'pdx-input-style', 'pdx-card-style']) {
        root().removeAttribute(a);
    }
    root().removeAttribute('style');
});

afterEach(() => {
    document.head.querySelectorAll('style').forEach((s) => s.remove());
});

describe('cssVar', () => {
    it('writes the variable and follows the signal', () => {
        const el = document.createElement('div');
        const color = cssVar('--brand', 'red', el);

        expect(el.style.getPropertyValue('--brand')).toBe('red');
        color.set('blue');
        expect(el.style.getPropertyValue('--brand'), 'the variable did not follow the signal').toBe('blue');
    });

    it('takes a getter for the initial value', () => {
        const el = document.createElement('div');
        cssVar('--brand', () => 'green', el);
        expect(el.style.getPropertyValue('--brand')).toBe('green');
    });

    it('defaults to the document root', () => {
        cssVar('--doc-level', 'x');
        expect(root().style.getPropertyValue('--doc-level')).toBe('x');
    });

    it('is a plain signal, readable and writable', () => {
        const v = cssVar('--v', 'a', document.createElement('div'));
        const seen: string[] = [];
        const stop = effect(() => { seen.push(v()); });
        v.set('b');
        expect(seen).toEqual(['a', 'b']);
        stop();
    });
});

describe('the token bridge', () => {
    it('discovers the --pdx-* declarations on :root', () => {
        styleSheet(':root { --pdx-color-primary: #123456; --pdx-space-md: 8px; --other: 1 }');
        const bridge = createTokenBridge();

        expect(bridge.names, 'the declared tokens were not discovered')
            .toEqual(expect.arrayContaining(['colorPrimary', 'spaceMd']));
        expect(bridge.names, 'a variable outside the prefix was picked up').not.toContain('other');
        bridge.disconnect();
    });

    it('reads a token by its camelCase name', () => {
        styleSheet(':root { --pdx-color-primary: #123456 }');
        const bridge = createTokenBridge();
        expect(bridge.get('colorPrimary')()).toBe('#123456');
        bridge.disconnect();
    });

    it('accepts the CSS name directly, without converting it twice', () => {
        styleSheet(':root { --pdx-color-primary: #123456 }');
        const bridge = createTokenBridge();
        expect(bridge.get('--pdx-color-primary')()).toBe('#123456');
        bridge.disconnect();
    });

    it('a token nobody declared reads as empty rather than throwing', () => {
        const bridge = createTokenBridge();
        expect(bridge.get('somethingNobodyDeclared')()).toBe('');
        bridge.disconnect();
    });

    it('set overrides the value on the element and in the signal', () => {
        styleSheet(':root { --pdx-color-primary: #123456 }');
        const bridge = createTokenBridge();
        const token = bridge.get('colorPrimary');

        bridge.set('colorPrimary', '#abcdef');

        expect(token()).toBe('#abcdef');
        expect(root().style.getPropertyValue('--pdx-color-primary')).toBe('#abcdef');
        bridge.disconnect();
    });

    it('snapshot and apply round-trip a whole palette', () => {
        styleSheet(':root { --pdx-color-primary: #111111; --pdx-color-bg: #ffffff }');
        const bridge = createTokenBridge();
        const before = bridge.snapshot();

        expect(before.colorPrimary).toBe('#111111');

        bridge.apply({ colorPrimary: '#222222', colorBg: '#000000' });
        expect(bridge.get('colorPrimary')()).toBe('#222222');

        bridge.apply(before);
        expect(bridge.get('colorPrimary'), 'the snapshot did not restore what it captured')
            .toBeTruthy();
        expect(bridge.get('colorPrimary')()).toBe('#111111');
        bridge.disconnect();
    });

    it('a custom prefix discovers only its own tokens', () => {
        styleSheet(':root { --app-brand: red; --pdx-color-primary: blue }');
        const bridge = createTokenBridge('--app-');

        expect(bridge.names).toContain('brand');
        expect(bridge.names).not.toContain('colorPrimary');
        bridge.disconnect();
    });

    it('reads from the element it is given, not the document', () => {
        const el = document.createElement('div');
        el.style.setProperty('--pdx-scoped', 'yes');
        document.body.appendChild(el);

        const bridge = createTokenBridge('--pdx-', el);
        expect(bridge.get('scoped')()).toBe('yes');

        bridge.disconnect();
        el.remove();
    });

    it('disconnect stops the observer and can be called twice', () => {
        const bridge = createTokenBridge();
        expect(() => { bridge.disconnect(); bridge.disconnect(); }).not.toThrow();
    });

    it('refresh re-reads the current computed values', () => {
        styleSheet(':root { --pdx-color-primary: #111111 }');
        const bridge = createTokenBridge();
        const token = bridge.get('colorPrimary');
        expect(token()).toBe('#111111');

        root().style.setProperty('--pdx-color-primary', '#999999');
        bridge.refresh();

        expect(token(), 'refresh did not pick up the new value').toBe('#999999');
        bridge.disconnect();
    });
});

describe('createTheme / applyTheme', () => {
    it('createTheme copies, so the caller cannot mutate the theme afterwards', () => {
        const source = { '--a': '1' };
        const theme = createTheme(source);
        source['--a'] = '2';
        expect(theme['--a']).toBe('1');
    });

    it('applyTheme writes every variable on the target', () => {
        const el = document.createElement('div');
        applyTheme({ '--a': '1', '--b': '2' }, el);
        expect(el.style.getPropertyValue('--a')).toBe('1');
        expect(el.style.getPropertyValue('--b')).toBe('2');
    });

    it('defaults to the document root', () => {
        applyTheme({ '--applied-here': 'yes' });
        expect(root().style.getPropertyValue('--applied-here')).toBe('yes');
    });
});

describe('the theme manager', () => {
    it('setTheme moves the attribute, the storage and the signal together', () => {
        setTheme('material');

        expect(root().getAttribute('pdx-theme')).toBe('material');
        expect(localStorage.getItem('pdx-theme')).toBe('material');
        expect(getTheme()).toBe('material');
        expect(currentTheme()).toBe('material');
    });

    it('setScheme does the same for light/dark', () => {
        setScheme('dark');

        expect(root().getAttribute('pdx-scheme')).toBe('dark');
        expect(localStorage.getItem('pdx-scheme')).toBe('dark');
        expect(getScheme()).toBe('dark');
        expect(currentScheme()).toBe('dark');
    });

    it('toggleDarkMode goes both ways', () => {
        setScheme('light');
        toggleDarkMode();
        expect(getScheme()).toBe('dark');
        toggleDarkMode();
        expect(getScheme()).toBe('light');
    });

    it('the theme signal is reactive, so a component can follow it', () => {
        setTheme('a');
        const seen: string[] = [];
        const stop = effect(() => { seen.push(currentTheme()); });
        setTheme('b');
        expect(seen).toEqual(['a', 'b']);
        stop();
    });

    it('mirrors the behaviour tokens onto <html> so the CSS selectors match', async () => {
        // `[pdx-input-style="filled"]` is a real selector in the design package: without this
        // mirroring a theme declaring the token would style nothing.
        styleSheet(':root { --pdx-input-style: filled; --pdx-card-style: flat }');
        setTheme('with-behaviour');
        await new Promise((r) => requestAnimationFrame(() => r(null)));

        expect(root().getAttribute('pdx-input-style')).toBe('filled');
        expect(root().getAttribute('pdx-card-style')).toBe('flat');
    });

    it('removes a behaviour attribute the new theme does not declare', async () => {
        styleSheet(':root { --pdx-input-style: filled }');
        setTheme('declares-it');
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        expect(root().getAttribute('pdx-input-style')).toBe('filled');

        document.head.querySelectorAll('style').forEach((s) => s.remove());
        setTheme('declares-nothing');
        await new Promise((r) => requestAnimationFrame(() => r(null)));

        expect(root().getAttribute('pdx-input-style'),
            'the previous theme\'s behaviour attribute stayed on <html>').toBeNull();
    });
});

describe('the observer on <html>', () => {
    it('refreshes the tokens when the theme attribute changes', async () => {
        styleSheet(':root { --pdx-color-primary: #111111 } [pdx-theme="dark-ish"] { --pdx-color-primary: #eeeeee }');
        const bridge = createTokenBridge();
        const token = bridge.get('colorPrimary');
        expect(token()).toBe('#111111');

        root().setAttribute('pdx-theme', 'dark-ish');
        await new Promise((r) => setTimeout(r, 0));
        await new Promise((r) => requestAnimationFrame(() => r(null)));

        expect(token(), 'switching theme left the token signals on the old palette').toBe('#eeeeee');
        bridge.disconnect();
    });

    it('ignores an attribute that is none of its business', async () => {
        styleSheet(':root { --pdx-color-primary: #111111 }');
        const bridge = createTokenBridge();
        const spy = vi.spyOn(window, 'requestAnimationFrame');

        root().setAttribute('lang', 'it');
        await new Promise((r) => setTimeout(r, 0));

        expect(spy, 'an unrelated attribute change triggered a full token refresh').not.toHaveBeenCalled();
        spy.mockRestore();
        bridge.disconnect();
    });
});
