// attach(el, fn, value) — an attachment: behaviour attached to an element, with its cleanup (#143).
//
// `attach:name="value"` in a template compiles to `attach(el, name, () => value)`. The function runs
// inside an effect owned by the scope that rendered the element: it runs on mount, again when the
// value it reads changes — its returned cleanup called first — and the cleanup runs once more when
// the element's scope is disposed. The compiled half is packages/compiler/tests/attach.test.ts.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { attach, autofocus, clickOutside, trapFocus } from '../src/index';
import { signal, collectDisposers } from '../src/reactivity/signal';
import { html } from '../src/renderer/template';

afterEach(() => { document.body.innerHTML = ''; });

describe('attach()', () => {
    it('runs on mount with the element and the value getter', () => {
        const el = document.createElement('div');
        const fn = vi.fn();
        const [, dispose] = collectDisposers(() => attach(el, fn, () => 'tip'));
        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn.mock.calls[0][0]).toBe(el);
        expect((fn.mock.calls[0][1] as () => unknown)()).toBe('tip');
        dispose();
    });

    it('runs again when its value changes, calling the previous cleanup first', () => {
        const el = document.createElement('div');
        const label = signal('a');
        const log: string[] = [];
        const [, dispose] = collectDisposers(() => attach(el, (_el, value) => {
            const v = value() as string;
            log.push(`run:${v}`);
            return () => log.push(`clean:${v}`);
        }, () => label()));
        label.set('b');
        expect(log).toEqual(['run:a', 'clean:a', 'run:b']);
        dispose();
        expect(log, 'the cleanup did not run when its scope was disposed').toEqual(['run:a', 'clean:a', 'run:b', 'clean:b']);
    });

    it('without a value, the getter returns undefined', () => {
        const fn = vi.fn();
        const [, dispose] = collectDisposers(() => attach(document.createElement('i'), fn));
        expect((fn.mock.calls[0][1] as () => unknown)()).toBeUndefined();
        dispose();
    });

    it('a read inside the attachment does not re-run it: only its value does', () => {
        const other = signal(1);
        const fn = vi.fn(() => { other(); });
        const [, dispose] = collectDisposers(() => attach(document.createElement('i'), fn, () => 'fixed'));
        other.set(2);
        expect(fn).toHaveBeenCalledTimes(1);
        dispose();
    });
});

describe('attach: in a hand-written html`` template', () => {
    it('attach:name=${[fn, getter]} attaches, and its cleanup runs with the scope', () => {
        const log: string[] = [];
        const fn = (el: Element, value: () => unknown) => { log.push(`run:${el.tagName}:${String(value())}`); return () => log.push('clean'); };
        const [frag, dispose] = collectDisposers(() => html`<input attach:probe=${[fn, () => 'x']} />`);
        document.body.appendChild(frag as Node);
        expect(log).toEqual(['run:INPUT:x']);
        dispose();
        expect(log).toEqual(['run:INPUT:x', 'clean']);
    });
});

describe('the built-in attachments', () => {
    it('autofocus focuses the element once it is in the document', async () => {
        const input = document.createElement('input');
        document.body.appendChild(input);
        const [, dispose] = collectDisposers(() => attach(input, autofocus));
        await Promise.resolve();
        expect(document.activeElement).toBe(input);
        dispose();
    });

    it('autofocus on a host focuses the first focusable element inside it', async () => {
        const host = document.createElement('app-field');
        host.innerHTML = '<label>Name</label><input>';
        document.body.appendChild(host);
        const [, dispose] = collectDisposers(() => attach(host, autofocus));
        await Promise.resolve();
        expect(document.activeElement).toBe(host.querySelector('input'));
        dispose();
    });

    it('clickOutside calls its handler for a press outside, not inside, and stops when disposed', () => {
        const box = document.createElement('div');
        box.innerHTML = '<button>in</button>';
        const outside = document.createElement('p');
        document.body.append(box, outside);
        const handler = vi.fn();
        const [, dispose] = collectDisposers(() => attach(box, clickOutside, () => handler));
        box.querySelector('button')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        expect(handler).not.toHaveBeenCalled();
        outside.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        expect(handler).toHaveBeenCalledTimes(1);
        dispose();
        outside.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        expect(handler, 'the listener outlived its scope').toHaveBeenCalledTimes(1);
    });

    it('trapFocus takes focus into the element, and gives it back when disposed', async () => {
        // The Tab cycling is focusTrap's own (a11y tests, and Chromium); this is the attachment's part:
        // the trap starts once the element is in the document, and its cleanup releases it.
        const before = document.createElement('button');
        const dialog = document.createElement('div');
        dialog.innerHTML = '<button id="a">a</button><button id="b">b</button>';
        document.body.append(before, dialog);
        before.focus();
        const [, dispose] = collectDisposers(() => attach(dialog, trapFocus));
        await Promise.resolve();
        expect(document.activeElement, 'the trap did not take focus').toBe(dialog.querySelector('#a'));
        dispose();
        expect(document.activeElement, 'the trap kept focus after its scope went').toBe(before);
    });
});
