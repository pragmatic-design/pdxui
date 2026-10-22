// F6 (#128, step 6): a value still waiting in a `::x.debounce(ms)` binding is written to its field
// before the form submits or validates.
//
// The binding already flushed on a native `submit` event of the element's form. A submit the page
// starts itself — `f.handleSubmit(fn)` from a button, `f.validate()` before a step — sent the value the
// field held before the last keystrokes, and validated that one.
//
// happy-dom splits an attribute name at `(`, so `::value.debounce(300)` is bound by the call the
// compiled template makes, as two-way-modifiers.test.ts does.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { bindTwoWay, collectDisposers, createForm, required } from '../src/index';

const mounted: HTMLElement[] = [];
afterEach(() => { for (const h of mounted.splice(0)) h.remove(); vi.useRealTimers(); });

function form() {
    return createForm({ initialValues: { email: '' }, validators: { email: [required()] } });
}
/** An input bound to `f.email` with `.debounce(300)`, and the function that disposes the binding. */
function mount(f: ReturnType<typeof form>): { input: HTMLInputElement; dispose: () => void } {
    const input = document.createElement('input');
    const host = document.createElement('div');
    host.appendChild(input);
    document.body.appendChild(host);
    mounted.push(host);
    const [, dispose] = collectDisposers(() => bindTwoWay(input, 'value.debounce(300)', f.email));
    return { input, dispose };
}
function type(input: HTMLInputElement, value: string): void {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('F6: a debounced value is written before the form reads it', () => {
    it('submitted inside the debounce window, the submitted value is the typed one', async () => {
        vi.useFakeTimers();
        const f = form();
        type(mount(f).input, 'ada@example.it');
        expect(f.email.value(), 'precondition: the value is still pending').toBe('');
        const sent: unknown[] = [];
        await f.handleSubmit((values) => { sent.push(values.email); })(new Event('submit'));
        expect(sent, 'the submit sent the value before the keystrokes, or refused it as empty').toEqual(['ada@example.it']);
    });

    it('validate() reads the typed value too', async () => {
        vi.useFakeTimers();
        const f = form();
        type(mount(f).input, 'x');
        expect(await f.validate()).toBe(true);
        expect(f.email.value()).toBe('x');
    });

    it('control — a value written on its own timer is not written again, and a disposed binding holds nothing back', async () => {
        vi.useFakeTimers();
        const f = form();
        const { input, dispose } = mount(f);
        type(input, 'first');
        vi.advanceTimersByTime(300);
        expect(f.email.value()).toBe('first');
        type(input, 'dropped');
        dispose();
        const sent: unknown[] = [];
        await f.handleSubmit((values) => { sent.push(values.email); })(new Event('submit'));
        expect(sent, 'a disposed binding wrote its pending value').toEqual(['first']);
    });
});
