// The two-way binding forms of the beta (#126): `.debounce(ms)`, the general `{ get, set }` form the
// modifiers are sugar of, `.number` that writes null for an empty entry and reports an invalid one,
// and `.once` on a plain binding.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { html, bindTwoWay } from '../src/renderer/template';
import { signal } from '../src/reactivity/signal';

const mounted: Element[] = [];
afterEach(() => { for (const el of mounted.splice(0)) el.remove(); vi.useRealTimers(); });
function mount(frag: Node): HTMLElement {
    const host = document.createElement('div');
    host.append(frag);
    document.body.appendChild(host);
    mounted.push(host);
    return host;
}
function type(input: HTMLInputElement, value: string): void {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * An input bound with `descriptor`, as the compiler binds it: happy-dom's HTML parser splits an
 * attribute name at `(` (Chromium does not, as the HTML standard says), so `debounce(300)` is bound
 * here by the call the compiled template makes. The compiled path is mounted in
 * packages/ui/tests/unit/two-way-modifiers-runtime.test.ts.
 */
function bound(descriptor: string, value: unknown, inForm = false): HTMLInputElement {
    const input = document.createElement('input');
    const host = mount(inForm ? document.createElement('form') : document.createDocumentFragment());
    (host.querySelector('form') ?? host).appendChild(input);
    bindTwoWay(input, descriptor, value);
    return input;
}

describe('::value.debounce(ms)', () => {
    it('writes once, ms after the last input', () => {
        vi.useFakeTimers();
        const q = signal('');
        const writes = vi.fn();
        const input = bound('value.debounce(300)', { get: () => q(), set: (v: string) => { writes(v); q.set(v); } });
        type(input, 'a');
        vi.advanceTimersByTime(200);
        type(input, 'ab');
        vi.advanceTimersByTime(299);
        expect(writes).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(writes.mock.calls).toEqual([['ab']]);
        expect(q()).toBe('ab');
    });

    it('writes at once on blur, and nothing later', () => {
        vi.useFakeTimers();
        const q = signal('');
        const input = bound('value.debounce(300)', q);
        type(input, 'now');
        input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
        expect(q()).toBe('now');
        q.set('changed elsewhere');
        vi.advanceTimersByTime(1000);
        expect(q(), 'the flushed write is not repeated by the timer').toBe('changed elsewhere');
    });

    it('writes at once when its form is submitted, before the form\'s own listeners', () => {
        vi.useFakeTimers();
        const q = signal('');
        const input = bound('value.debounce(300)', q, true);
        const form = input.form!;
        let seen = '';
        form.addEventListener('submit', (e) => { e.preventDefault(); seen = q(); });
        type(input, 'typed');
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        expect(seen).toBe('typed');
    });
});

describe('the { get, set } form', () => {
    it('round-trips a formatted value', () => {
        const cents = signal(1250);
        const host = mount(html`<input ::value=${{
            get: () => (cents() / 100).toFixed(2),
            set: (s: string) => cents.set(Math.round(Number(s) * 100)),
        }} />`);
        const input = host.querySelector('input')!;
        expect(input.value).toBe('12.50');
        type(input, '3.1');
        expect(cents()).toBe(310);
        cents.set(5);
        expect(input.value).toBe('0.05');
    });
});

describe('::value.number', () => {
    it('writes a number, null for an empty entry, and leaves the value for an invalid one, marking it', () => {
        const n = signal<number | null>(7);
        const host = mount(html`<input ::value.number=${n} />`);
        const input = host.querySelector('input')!;
        type(input, ' 42 ');
        expect(n()).toBe(42);
        expect(input.hasAttribute('aria-invalid')).toBe(false);
        type(input, '');
        expect(n()).toBeNull();
        type(input, '1,5');
        expect(n(), 'an invalid entry does not write').toBeNull();
        expect(input.getAttribute('aria-invalid')).toBe('true');
        expect(input.validity.customError).toBe(true);
        type(input, '1.5');
        expect(n()).toBe(1.5);
        expect(input.hasAttribute('aria-invalid')).toBe(false);
        expect(input.validity.customError).toBe(false);
    });
});

describe('the modifiers that were there', () => {
    it('.trim trims, .lazy waits for change', () => {
        const s = signal('');
        const host = mount(html`<input ::value.trim.lazy=${s} />`);
        const input = host.querySelector('input')!;
        type(input, '  x  ');
        expect(s()).toBe('');
        input.dispatchEvent(new Event('change', { bubbles: true }));
        expect(s()).toBe('x');
    });
});

describe(':name.once', () => {
    it('assigns once and does not follow the signal', () => {
        const title = signal('first');
        const host = mount(html`<p :title.once=${() => title()}>x</p>`);
        const p = host.querySelector('p')!;
        expect(p.title).toBe('first');
        title.set('second');
        expect(p.title).toBe('first');
        expect((p as unknown as Record<string, unknown>)['title.once']).toBeUndefined();
    });
});
