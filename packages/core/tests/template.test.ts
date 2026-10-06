import { describe, it, expect, beforeEach } from 'vitest';
import { signal } from '../src/reactivity/signal';
import { html } from '../src/renderer/template';

describe('html template', () => {
    it('renders static HTML', () => {
        const frag = html`<div class="test">Hello</div>`;
        const div = frag.querySelector('div');
        expect(div).not.toBeNull();
        expect(div!.className).toBe('test');
        expect(div!.textContent).toBe('Hello');
    });

    it('renders static text interpolation', () => {
        const name = 'World';
        const frag = html`<span>${name}</span>`;
        expect(frag.querySelector('span')!.textContent).toBe('World');
    });

    it('renders reactive text via signal', () => {
        const count = signal(0);
        const frag = html`<span>${count}</span>`;

        // Mount to document so effects work
        document.body.appendChild(frag);
        const span = document.body.querySelector('span')!;

        expect(span.textContent).toBe('0');

        count.set(42);
        expect(span.textContent).toBe('42');

        document.body.innerHTML = '';
    });

    it('renders reactive text via arrow function', () => {
        const count = signal(0);
        const frag = html`<span>${() => `Count: ${count()}`}</span>`;

        document.body.appendChild(frag);
        const span = document.body.querySelector('span')!;

        expect(span.textContent).toBe('Count: 0');

        count.set(5);
        expect(span.textContent).toBe('Count: 5');

        document.body.innerHTML = '';
    });

    it('binds event handlers via @click', () => {
        let clicked = false;
        const frag = html`<button @click=${() => { clicked = true; }}>Click</button>`;

        document.body.appendChild(frag);
        const btn = document.body.querySelector('button')!;

        btn.click();
        expect(clicked).toBe(true);

        document.body.innerHTML = '';
    });

    it('binds reactive attributes', () => {
        const active = signal(true);
        const frag = html`<div class=${() => active() ? 'on' : 'off'}></div>`;

        document.body.appendChild(frag);
        const div = document.body.querySelector('div')!;

        expect(div.className).toBe('on');

        active.set(false);
        expect(div.className).toBe('off');

        document.body.innerHTML = '';
    });

    it('handles null/false as empty text', () => {
        const show = signal(false);
        const frag = html`<div>${() => show() ? 'visible' : null}</div>`;

        document.body.appendChild(frag);
        const div = document.body.querySelector('div')!;

        expect(div.textContent).toBe('');

        show.set(true);
        expect(div.textContent).toBe('visible');

        document.body.innerHTML = '';
    });
});

// ─── Property Binding (:attr) ──────────────────────────────────────

describe('property binding (:attr)', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it('sets JS property via :prop', () => {
        const frag = html`<input :value=${'hello'}>`;
        document.body.appendChild(frag);
        const input = document.body.querySelector('input')!;
        expect(input.value).toBe('hello');
    });

    it('reactively updates property', () => {
        const val = signal('initial');
        const frag = html`<input :value=${() => val()}>`;
        document.body.appendChild(frag);
        const input = document.body.querySelector('input')!;
        expect(input.value).toBe('initial');

        val.set('updated');
        expect(input.value).toBe('updated');
    });

    it('sets boolean property', () => {
        const disabled = signal(true);
        const frag = html`<button :disabled=${() => disabled()}>Click</button>`;
        document.body.appendChild(frag);
        const btn = document.body.querySelector('button')!;
        expect(btn.disabled).toBe(true);

        disabled.set(false);
        expect(btn.disabled).toBe(false);
    });

    it('sets hidden property directly', () => {
        const frag = html`<div :hidden=${true}></div>`;
        document.body.appendChild(frag);
        expect(document.body.querySelector('div')!.hidden).toBe(true);
    });
});

// ─── Two-Way Binding (::attr) ──────────────────────────────────────

describe('two-way binding (::attr)', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it('binds signal to input value bidirectionally', () => {
        const name = signal('John');
        const frag = html`<input ::value=${name}>`;
        document.body.appendChild(frag);
        const input = document.body.querySelector('input')!;

        // Signal → DOM
        expect(input.value).toBe('John');
        name.set('Jane');
        expect(input.value).toBe('Jane');

        // DOM → Signal
        input.value = 'Bob';
        input.dispatchEvent(new Event('input'));
        expect(name()).toBe('Bob');
    });

    it('binds signal to checkbox checked', () => {
        const checked = signal(false);
        const frag = html`<input type="checkbox" ::checked=${checked}>`;
        document.body.appendChild(frag);
        const input = document.body.querySelector('input')!;

        expect(input.checked).toBe(false);
        checked.set(true);
        expect(input.checked).toBe(true);

        // DOM → Signal via change event
        input.checked = false;
        input.dispatchEvent(new Event('change'));
        expect(checked()).toBe(false);
    });

    it('binds signal to select value', () => {
        const selected = signal('b');
        const frag = html`<select ::value=${selected}>
            <option value="a">A</option>
            <option value="b">B</option>
        </select>`;
        document.body.appendChild(frag);
        const select = document.body.querySelector('select')!;

        expect(select.value).toBe('b');

        select.value = 'a';
        select.dispatchEvent(new Event('change'));
        expect(selected()).toBe('a');
    });

    it('falls back to one-way for non-signal values', () => {
        const frag = html`<input ::value=${'static'}>`;
        document.body.appendChild(frag);
        expect(document.body.querySelector('input')!.value).toBe('static');
    });

    // Custom elements emit pdx-input/pdx-change with the value in e.detail; listening for a
    // `pdx-value` that is never emitted would leave ::value silently one-way.
    it('binds ::value on a custom element via pdx-input / e.detail', () => {
        const name = signal('a');
        const frag = html`<pdx-fake-input ::value=${name}></pdx-fake-input>`;
        document.body.appendChild(frag);
        const el = document.body.querySelector('pdx-fake-input')!;
        // Forward binding still sets the property
        expect((el as unknown as { value: string }).value).toBe('a');
        // Backward: component emits pdx-input with the fresh value in detail
        el.dispatchEvent(new CustomEvent('pdx-input', { detail: { value: 'typed' } }));
        expect(name()).toBe('typed');
        // pdx-change also updates
        el.dispatchEvent(new CustomEvent('pdx-change', { detail: { value: 'committed' } }));
        expect(name()).toBe('committed');
    });

    it('binds ::checked on a custom element via e.detail.checked', () => {
        const checked = signal(false);
        const frag = html`<pdx-fake-check ::checked=${checked}></pdx-fake-check>`;
        document.body.appendChild(frag);
        const el = document.body.querySelector('pdx-fake-check')!;
        el.dispatchEvent(new CustomEvent('pdx-change', { detail: { checked: true, value: 'x' } }));
        expect(checked()).toBe(true);
    });
});

// ─── Event Modifiers (@event.mod) ──────────────────────────────────

describe('event modifiers (@event.mod)', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it('supports .prevent modifier', () => {
        let defaultPrevented = false;
        const frag = html`<a @click.prevent=${(e: Event) => { defaultPrevented = e.defaultPrevented; }}>Link</a>`;
        document.body.appendChild(frag);
        document.body.querySelector('a')!.click();
        expect(defaultPrevented).toBe(true);
    });

    it('supports .stop modifier', () => {
        let propagated = false;
        const frag = html`<div @click=${() => { propagated = true; }}>
            <button @click.stop=${() => {}}>Click</button>
        </div>`;
        document.body.appendChild(frag);

        document.body.querySelector('button')!.click();
        expect(propagated).toBe(false);
    });

    it('supports .once modifier', () => {
        let count = 0;
        const frag = html`<button @click.once=${() => { count++; }}>Click</button>`;
        document.body.appendChild(frag);
        const btn = document.body.querySelector('button')!;

        btn.click();
        btn.click();
        btn.click();
        expect(count).toBe(1);
    });

    it('supports .self modifier', () => {
        let clicked = false;
        const frag = html`<div @click.self=${() => { clicked = true; }}>
            <span>child</span>
        </div>`;
        document.body.appendChild(frag);

        // Click child — should NOT trigger
        document.body.querySelector('span')!.click();
        expect(clicked).toBe(false);

        // Click div itself
        document.body.querySelector('div')!.click();
        expect(clicked).toBe(true);
    });

    it('supports key modifiers (.enter)', () => {
        let triggered = false;
        const frag = html`<input @keydown.enter=${() => { triggered = true; }}>`;
        document.body.appendChild(frag);
        const input = document.body.querySelector('input')!;

        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
        expect(triggered).toBe(false);

        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(triggered).toBe(true);
    });

    it('supports .escape key modifier', () => {
        let triggered = false;
        const frag = html`<input @keydown.escape=${() => { triggered = true; }}>`;
        document.body.appendChild(frag);
        const input = document.body.querySelector('input')!;

        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(triggered).toBe(false);

        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(triggered).toBe(true);
    });

    it('supports combined modifiers (.prevent.stop)', () => {
        let defaultPrevented = false;
        let propagated = false;

        const frag = html`<div @click=${() => { propagated = true; }}>
            <button @click.prevent.stop=${(e: Event) => { defaultPrevented = e.defaultPrevented; }}>Click</button>
        </div>`;
        document.body.appendChild(frag);

        document.body.querySelector('button')!.click();
        expect(defaultPrevented).toBe(true);
        expect(propagated).toBe(false);
    });

    it('plain @click without modifiers still works', () => {
        let clicked = false;
        const frag = html`<button @click=${() => { clicked = true; }}>Click</button>`;
        document.body.appendChild(frag);

        document.body.querySelector('button')!.click();
        expect(clicked).toBe(true);
    });
});

// ─── Template Caching ──────────────────────────────────────────────

describe('template caching', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it('produces correct output for repeated template calls', () => {
        function render(name: string) {
            return html`<span>${name}</span>`;
        }

        const a = render('Alice');
        const b = render('Bob');

        document.body.appendChild(a);
        document.body.appendChild(b);

        const spans = document.body.querySelectorAll('span');
        expect(spans.length).toBe(2);
        expect(spans[0].textContent).toBe('Alice');
        expect(spans[1].textContent).toBe('Bob');
    });

    it('each instance has independent reactivity', () => {
        function render(count: ReturnType<typeof signal<number>>) {
            return html`<span>${count}</span>`;
        }

        const a = signal(1);
        const b = signal(100);

        document.body.appendChild(render(a));
        document.body.appendChild(render(b));

        const spans = document.body.querySelectorAll('span');
        expect(spans[0].textContent).toBe('1');
        expect(spans[1].textContent).toBe('100');

        a.set(2);
        expect(spans[0].textContent).toBe('2');
        expect(spans[1].textContent).toBe('100');
    });
});

// ─── Kebab-case → camelCase Property Binding ─────────────────────

describe('kebab-case property binding', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    // The camelCase conversion is asserted on a component, not a <div>: both names are COMPONENT
    // props — `itemTemplate` is declared by `pdx-select` and bound in the site as
    // `<pdx-select :item-template="renderTeamItem">` — and on a plain element the property is an
    // expando nothing can read. A hyphenated binding on a plain element becomes an ATTRIBUTE, which
    // is what `:attr=` is documented to do, so the conversion is asserted where it means something
    // and the plain-element case is asserted beside it.
    it('converts kebab-case :prop to camelCase JS property on a component', () => {
        const frag = html`<kebab-probe :item-template=${() => 'test-value'}></kebab-probe>`;
        document.body.appendChild(frag);

        const el = document.body.querySelector('kebab-probe')!;
        expect((el as any).itemTemplate).toBe('test-value');
    });

    it('converts multi-word kebab to camelCase on a component', () => {
        const frag = html`<kebab-probe :selected-row-keys=${'hello'}></kebab-probe>`;
        document.body.appendChild(frag);

        const el = document.body.querySelector('kebab-probe')!;
        expect((el as any).selectedRowKeys).toBe('hello');
    });

    it('sets the same binding as an ATTRIBUTE on a plain element', () => {
        const frag = html`<div :item-template=${'x'} :selected-row-keys=${'hello'}></div>`;
        document.body.appendChild(frag);

        const div = document.body.querySelector('div')!;
        expect(div.getAttribute('item-template')).toBe('x');
        expect(div.getAttribute('selected-row-keys')).toBe('hello');
        expect((div as any).itemTemplate, 'a plain element got an unreadable expando instead').toBeUndefined();
    });

    it('preserves aria-* as attributes (not properties)', () => {
        const frag = html`<button :aria-label=${'Close'}>X</button>`;
        document.body.appendChild(frag);

        const btn = document.body.querySelector('button')!;
        expect(btn.getAttribute('aria-label')).toBe('Close');
    });

    it('preserves data-* as attributes (not properties)', () => {
        const frag = html`<div :data-id=${'42'}></div>`;
        document.body.appendChild(frag);

        const div = document.body.querySelector('div')!;
        expect(div.getAttribute('data-id')).toBe('42');
    });

    it('single-word props pass through unchanged', () => {
        const frag = html`<div :title=${'hi'}></div>`;
        document.body.appendChild(frag);

        const div = document.body.querySelector('div')!;
        expect(div.title).toBe('hi');
    });
});
