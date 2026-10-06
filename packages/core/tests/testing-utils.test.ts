// Tests for @pdxui/core/testing utilities.

import { describe, it, expect, afterEach } from 'vitest';
import { mount, cleanup, tick, fireEvent, waitFor } from '../src/testing/index';
import { signal, effect } from '../src/reactivity/signal';

afterEach(() => cleanup());

describe('mount()', () => {
    it('creates a container with the given HTML', async () => {
        const el = await mount('<div class="test">Hello</div>');
        expect(el.querySelector('.test')?.textContent).toBe('Hello');
    });

    it('appends container to document.body', async () => {
        await mount('<span id="mounted">Ok</span>');
        expect(document.getElementById('mounted')).toBeTruthy();
    });

    it('returns container element for querying', async () => {
        const el = await mount('<p>A</p><p>B</p>');
        expect(el.querySelectorAll('p')).toHaveLength(2);
    });
});

describe('cleanup()', () => {
    it('removes all mounted containers', async () => {
        await mount('<div id="c1">1</div>');
        await mount('<div id="c2">2</div>');
        expect(document.getElementById('c1')).toBeTruthy();
        expect(document.getElementById('c2')).toBeTruthy();

        cleanup();

        expect(document.getElementById('c1')).toBeNull();
        expect(document.getElementById('c2')).toBeNull();
    });

    it('can be called when nothing is mounted', () => {
        expect(() => cleanup()).not.toThrow();
    });
});

describe('tick()', () => {
    it('flushes microtasks', async () => {
        let ran = false;
        queueMicrotask(() => { ran = true; });
        await tick();
        expect(ran).toBe(true);
    });

    it('flushes signal effects', async () => {
        const count = signal(0);
        let effectValue = -1;
        effect(() => { effectValue = count(); });
        expect(effectValue).toBe(0);

        count.set(5);
        await tick();
        expect(effectValue).toBe(5);
    });
});

describe('fireEvent()', () => {
    it('dispatches click event', async () => {
        const el = await mount('<button id="btn">Click</button>');
        const btn = el.querySelector('#btn')!;
        let clicked = false;
        btn.addEventListener('click', () => { clicked = true; });

        fireEvent(btn, 'click');
        expect(clicked).toBe(true);
    });

    it('dispatches custom event with detail', async () => {
        const el = await mount('<div id="target"></div>');
        const target = el.querySelector('#target')!;
        let receivedDetail: unknown;
        target.addEventListener('my-event', ((e: CustomEvent) => {
            receivedDetail = e.detail;
        }) as EventListener);

        fireEvent(target, 'my-event', { value: 42 });
        expect(receivedDetail).toEqual({ value: 42 });
    });

    it('events bubble by default', async () => {
        const el = await mount('<div id="parent"><span id="child">Hi</span></div>');
        const child = el.querySelector('#child')!;
        let bubbled = false;
        el.querySelector('#parent')!.addEventListener('click', () => { bubbled = true; });

        fireEvent(child, 'click');
        expect(bubbled).toBe(true);
    });
});

describe('waitFor()', () => {
    it('resolves when condition is true', async () => {
        let ready = false;
        setTimeout(() => { ready = true; }, 100);
        await waitFor(() => ready);
        expect(ready).toBe(true);
    });

    it('throws on timeout', async () => {
        await expect(
            waitFor(() => false, 200)
        ).rejects.toThrow('timed out after 200ms');
    });

    it('works with async conditions', async () => {
        let count = 0;
        const interval = setInterval(() => count++, 50);
        await waitFor(async () => count >= 3);
        clearInterval(interval);
        expect(count).toBeGreaterThanOrEqual(3);
    });
});
