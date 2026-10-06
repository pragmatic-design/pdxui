// The start-up splash leaves when the app is ready, and not before.
import { describe, it, expect, beforeEach, vi } from 'vitest';

type SplashModule = typeof import('../src/browser/splash');

/** A fresh module each time: its state is the page's, once per load. */
async function freshSplash(): Promise<SplashModule> {
    vi.resetModules();
    return import('../src/browser/splash');
}

const frame = () => new Promise(r => requestAnimationFrame(() => r(undefined)));
const tick = () => new Promise(r => setTimeout(r, 0));

function mountSplash(style = ''): HTMLElement {
    document.body.setAttribute('aria-busy', 'true');
    const el = document.createElement('div');
    el.id = 'pdx-splash';
    el.setAttribute('aria-hidden', 'true');
    if (style) el.setAttribute('style', style);
    document.body.appendChild(el);
    return el;
}

describe('pdx-splash', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        document.body.removeAttribute('aria-busy');
    });

    it('stays while a condition is pending, and leaves once it settles', async () => {
        mountSplash();
        const splash = await freshSplash();
        let release!: () => void;
        splash.splashReady(new Promise<void>(r => { release = r; }));
        await tick(); await frame(); await frame();
        expect(document.getElementById('pdx-splash'), 'left before the app was ready').not.toBeNull();
        expect(splash.isSplashUp()).toBe(true);
        expect(document.body.getAttribute('aria-busy')).toBe('true');

        release();
        await tick(); await frame(); await frame();
        expect(document.getElementById('pdx-splash'), 'ready, and still up').toBeNull();
        expect(splash.isSplashUp()).toBe(false);
        expect(document.body.hasAttribute('aria-busy')).toBe(false);
    });

    it('waits for EVERY condition, not the first', async () => {
        mountSplash();
        const splash = await freshSplash();
        let first!: () => void;
        let second!: () => void;
        splash.splashReady(new Promise<void>(r => { first = r; }));
        splash.splashReady(new Promise<void>(r => { second = r; }));
        first();
        await tick(); await frame(); await frame();
        expect(document.getElementById('pdx-splash')).not.toBeNull();
        second();
        await tick(); await frame(); await frame();
        expect(document.getElementById('pdx-splash')).toBeNull();
    });

    it('a condition that fails still lets the app appear', async () => {
        mountSplash();
        const splash = await freshSplash();
        splash.splashReady(Promise.reject(new Error('the first data did not come')));
        await tick(); await frame(); await frame();
        expect(document.getElementById('pdx-splash')).toBeNull();
    });

    it('with a transition, fades first and is removed on transitionend', async () => {
        // Longhands: happy-dom does not expand the `transition` shorthand in a computed style.
        const el = mountSplash('transition-property: opacity; transition-duration: 0.2s');
        const splash = await freshSplash();
        splash.splashReady(Promise.resolve());
        await tick(); await frame(); await frame();
        expect(el.isConnected, 'removed before its fade').toBe(true);
        expect(el.classList.contains('pdx-splash-leaving')).toBe(true);
        expect(splash.isSplashUp(), 'a leaving splash is not up').toBe(false);
        el.dispatchEvent(new Event('transitionend'));
        expect(el.isConnected).toBe(false);
    });

    it('without one — reduced motion — it is removed at once', async () => {
        const el = mountSplash('transition: none');
        const splash = await freshSplash();
        splash.splashReady(Promise.resolve());
        await tick(); await frame(); await frame();
        expect(el.isConnected).toBe(false);
    });

    it('the design system\'s reduced-motion duration, 0.01ms, counts as none', async () => {
        // adaptive.css: `transition-duration: 0.01ms !important` under prefers-reduced-motion.
        const el = mountSplash('transition-property: opacity; transition-duration: 0.01ms');
        const splash = await freshSplash();
        splash.splashReady(Promise.resolve());
        await tick(); await frame(); await frame();
        expect(el.isConnected).toBe(false);
    });

    it('control — no splash in the page: splashReady is harmless', async () => {
        const splash = await freshSplash();
        splash.splashReady(Promise.resolve());
        await tick(); await frame();
        expect(splash.isSplashUp()).toBe(false);
    });
});
