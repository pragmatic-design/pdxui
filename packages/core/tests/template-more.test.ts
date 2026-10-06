// html`` — the parts the existing template.test.ts does not reach: the tag scanner, the table
// context, mixed static+dynamic attributes, the URL sanitiser on properties, the :show/:class./
// :style. bindings, and the two-way modifiers.
//
// Effects here flush synchronously, so every reactive assertion reads the DOM straight after the
// signal write — the same way template.test.ts does.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { signal } from '../src/reactivity/signal';
import { html } from '../src/renderer/template';

/** Mount so effects have a live parent, and hand back the root element. */
function mount(frag: DocumentFragment): HTMLElement {
    const host = document.createElement('div');
    host.appendChild(frag);
    document.body.appendChild(host);
    return host;
}

afterEach(() => { document.body.innerHTML = ''; });

describe('the tag scanner', () => {
    it('an interpolation inside a quoted attribute containing ">" is still an attribute', () => {
        // The scanner is quote-aware: without that, the `>` inside the title would close the tag
        // and the second value would be parsed as text content.
        const frag = html`<div title="a > b" data-x=${'v'}>t</div>`;
        const el = mount(frag).querySelector('div')!;
        expect(el.getAttribute('data-x')).toBe('v');
        expect(el.textContent).toBe('t');
    });

    it('an HTML comment in the template does not swallow what follows', () => {
        const frag = html`<div><!-- a note --><span>${'in'}</span></div>`;
        expect(mount(frag).querySelector('span')!.textContent).toBe('in');
    });

    it('a comment that only closes in a later chunk still parses', () => {
        // The scanner parks on an unterminated comment and retries with more text.
        const frag = html`<div><!-- ${'x'} --><b>${'y'}</b></div>`;
        expect(mount(frag).querySelector('b')!.textContent).toBe('y');
    });

    it('single quotes delimit an attribute too', () => {
        const frag = html`<div title='a > b' id=${'the-id'}>t</div>`;
        expect(mount(frag).querySelector('div')!.id).toBe('the-id');
    });
});

describe('table context', () => {
    it('a template starting with <tr> keeps its cells', () => {
        // Parsed outside a <table>, the browser throws these elements away.
        const frag = html`<tr><td>${'a'}</td><td>b</td></tr>`;
        const tr = frag.querySelector('tr');
        expect(tr, 'the row was stripped by the parser').not.toBeNull();
        expect(tr!.querySelectorAll('td')).toHaveLength(2);
        expect(tr!.querySelector('td')!.textContent).toBe('a');
    });

    // Written out one by one on purpose: the tag name cannot be interpolated — a placeholder
    // there lands in the markup, not in the parser's decision about table context.
    it('<td> survives too', () => {
        expect(html`<td>${'x'}</td>`.querySelector('td')).not.toBeNull();
    });
    it('<th> survives too', () => {
        expect(html`<th>x</th>`.querySelector('th')).not.toBeNull();
    });
    it('<thead> survives too', () => {
        expect(html`<thead><tr><td>x</td></tr></thead>`.querySelector('thead')).not.toBeNull();
    });
    it('<tbody> survives too', () => {
        expect(html`<tbody><tr><td>x</td></tr></tbody>`.querySelector('tbody')).not.toBeNull();
    });
    it('<tfoot> survives too', () => {
        expect(html`<tfoot><tr><td>x</td></tr></tfoot>`.querySelector('tfoot')).not.toBeNull();
    });
    it('<caption> survives too', () => {
        expect(html`<caption>x</caption>`.querySelector('caption')).not.toBeNull();
    });
    it('<colgroup> survives too', () => {
        expect(html`<colgroup><col /></colgroup>`.querySelector('colgroup')).not.toBeNull();
    });
    it('a bare <col> keeps being a column', () => {
        // It needs a <colgroup> around it, not a <tbody>: measured before the fix, this fragment
        // came out completely empty.
        expect(html`<col span=${2} />`.querySelector('col')).not.toBeNull();
    });

    it('a leading <div> is not wrapped in a table', () => {
        const frag = html`<div>x</div>`;
        expect(frag.querySelector('table')).toBeNull();
    });
});

describe('mixed static and dynamic attribute values', () => {
    it('concatenates around the placeholder', () => {
        const frag = html`<div class="btn btn-${'primary'} big">x</div>`;
        expect(mount(frag).querySelector('div')!.className).toBe('btn btn-primary big');
    });

    it('takes several placeholders in one value', () => {
        const frag = html`<div data-k="${'a'}-${'b'}">x</div>`;
        expect(mount(frag).querySelector('div')!.getAttribute('data-k')).toBe('a-b');
    });

    it('stays reactive when one of the parts is a signal', () => {
        const variant = signal('primary');
        const frag = html`<div class="btn btn-${variant}">x</div>`;
        const el = mount(frag).querySelector('div')!;

        expect(el.className).toBe('btn btn-primary');
        variant.set('danger');
        expect(el.className, 'a mixed attribute stopped following its signal').toBe('btn btn-danger');
    });

    it('a nullish part becomes empty, not the word "null"', () => {
        const frag = html`<div data-k="x-${null}">t</div>`;
        expect(mount(frag).querySelector('div')!.getAttribute('data-k')).toBe('x-');
    });
});

describe(':prop bindings', () => {
    it('maps the HTML names that differ from their property', () => {
        const frag = html`<label :for=${'the-input'} :tabindex=${3}></label>`;
        const el = mount(frag).querySelector('label')!;
        expect(el.htmlFor).toBe('the-input');
        expect(el.tabIndex).toBe(3);
    });

    it('merges :class with the static class instead of replacing it', () => {
        // Asserted through outerHTML, not className: happy-dom leaves `getAttribute('class')` and
        // `className` reading the pre-binding value on an element whose `:class` attribute was
        // removed by name (it parses the colon as a namespace prefix). The serialised markup is
        // the one that reflects what the DOM actually holds.
        const extra = signal('active');
        const el = mount(html`<div class="base" :class=${extra}>x</div>`).querySelector('div')!;

        expect(el.outerHTML).toContain('class="base active"');
        extra.set('done');
        expect(el.outerHTML).toContain('class="base done"');
        extra.set('');
        expect(el.outerHTML, 'clearing the dynamic half took the static class with it')
            .toContain('class="base"');
    });

    // `:class` together with `:class.x` on one element is measured in Chromium, in
    // packages/responsive/tests/integration/ui-components/class-toggle-binding.spec.ts.
    // happy-dom cannot hold it: once an element has had a `:class` attribute, its getAttribute('class')
    // and classList keep the pre-binding value while outerHTML shows the bound one, so a classList
    // toggle writes from the stale value.
    it('a :class value with two classes swaps both, and keeps a dynamic class that is also static', async () => {
        const cls = signal('a b');
        const el = mount(html`<div class="base b" :class=${() => cls()}>x</div>`).querySelector('div')!;
        cls.set('c');
        await Promise.resolve();
        const tokens = /class="([^"]*)"/.exec(el.outerHTML)![1].split(/\s+/).sort();
        expect(tokens, 'b is static: dropping the dynamic b must not take it').toEqual(['b', 'base', 'c']);
    });

    it('merges a static :class value too', () => {
        const el = mount(html`<div class="base" :class=${'extra'}>x</div>`).querySelector('div')!;
        expect(el.outerHTML).toContain('class="base extra"');
    });

    it('a :class with no static class stands on its own', () => {
        const el = mount(html`<div :class=${'only'}>x</div>`).querySelector('div')!;
        expect(el.outerHTML).toContain('class="only"');
    });

    it('a null property removes the attribute rather than coercing it', () => {
        // maxLength = null would become 0, which forbids all input.
        const len = signal<number | null>(5);
        const frag = html`<input :maxlength=${len} />`;
        const el = mount(frag).querySelector('input')!;
        expect(el.maxLength).toBe(5);

        len.set(null);
        expect(el.hasAttribute('maxlength')).toBe(false);
    });

    it('an aria value of true becomes the empty attribute, false removes it', () => {
        const on = signal<boolean | string>(true);
        const frag = html`<div :aria-expanded=${on}>x</div>`;
        const el = mount(frag).querySelector('div')!;
        expect(el.getAttribute('aria-expanded')).toBe('');

        on.set('false');
        expect(el.getAttribute('aria-expanded')).toBe('false');
        on.set(false);
        expect(el.hasAttribute('aria-expanded')).toBe(false);
    });

    it('a static aria value follows the same rule', () => {
        const el = mount(html`<div :aria-hidden=${true} :aria-label=${null}>x</div>`).querySelector('div')!;
        expect(el.getAttribute('aria-hidden')).toBe('');
        expect(el.hasAttribute('aria-label')).toBe(false);
    });
});

describe(':href and the other URL properties', () => {
    it('refuses a javascript: URL arriving from data', () => {
        const frag = html`<a :href=${'javascript:alert(1)'}>x</a>`;
        const el = mount(frag).querySelector('a')!;
        expect(el.getAttribute('href'), 'a bound value became an executable URL').toBeNull();
    });

    it('refuses it reactively as well, and lets a safe one back in', () => {
        const to = signal('/ok');
        const frag = html`<a :href=${to}>x</a>`;
        const el = mount(frag).querySelector('a')!;
        expect(el.getAttribute('href')).toBe('/ok');

        to.set('javascript:alert(1)');
        expect(el.hasAttribute('href')).toBe(false);

        to.set('/back');
        expect(el.getAttribute('href')).toBe('/back');
    });

    it('refuses a protocol-relative URL, which navigates cross-origin with no scheme', () => {
        const el = mount(html`<img :src=${'//evil.example/x.png'} />`).querySelector('img')!;
        expect(el.getAttribute('src')).toBeNull();
    });

    it('leaves :data alone — it carries bound arrays, not a URL', () => {
        const rows = [{ id: 1 }];
        const el = mount(html`<pdx-grid :data=${rows}></pdx-grid>`).firstElementChild!;
        expect((el as unknown as { data: unknown }).data,
            'the bound array was stringified by the URL sanitiser').toBe(rows);
    });
});

describe(':ref, :show, :class.x and :style.x', () => {
    it(':ref hands the element to the signal', () => {
        const el = signal<Element | null>(null);
        mount(html`<div :ref=${el}>x</div>`);
        expect(el()).toBeInstanceOf(HTMLElement);
        expect((el() as HTMLElement).tagName).toBe('DIV');
    });

    it(':ref with something that is not a signal is ignored, not a crash', () => {
        expect(() => mount(html`<div :ref=${'oops'}>x</div>`)).not.toThrow();
    });

    it(':show toggles display and keeps the node in the DOM', () => {
        const open = signal(true);
        const host = mount(html`<div :show=${open}>x</div>`);
        const el = host.querySelector('div')!;

        expect(el.style.display).toBe('');
        open.set(false);
        expect(el.style.display).toBe('none');
        expect(host.contains(el), ':show removed the node instead of hiding it').toBe(true);
    });

    it(':show takes a static value too', () => {
        expect(mount(html`<div :show=${false}>x</div>`).querySelector('div')!.style.display).toBe('none');
    });

    it(':class.name toggles one class without touching the others', () => {
        const on = signal(false);
        const el = mount(html`<div class="a b" :class.active=${on}>x</div>`).querySelector('div')!;

        expect(el.classList.contains('active')).toBe(false);
        on.set(true);
        expect(el.className.split(' ').sort()).toEqual(['a', 'active', 'b']);
    });

    it(':class.name with a static truthy value', () => {
        expect(mount(html`<div :class.on=${1}>x</div>`).querySelector('div')!.classList.contains('on')).toBe(true);
    });

    it(':style.prop sets one property, reactively', () => {
        const w = signal('10px');
        const el = mount(html`<div :style.width=${w}>x</div>`).querySelector('div')!;
        expect(el.style.width).toBe('10px');
        w.set('20px');
        expect(el.style.width).toBe('20px');
    });

    it(':style.prop with a nullish value writes empty rather than "null"', () => {
        const el = mount(html`<div :style.color=${null}>x</div>`).querySelector('div')!;
        expect(el.style.color).toBe('');
    });

    it(':style.prop works for a custom property', () => {
        const el = mount(html`<div :style.--gap=${'4px'}>x</div>`).querySelector('div')!;
        expect(el.style.getPropertyValue('--gap')).toBe('4px');
    });
});

describe('two-way modifiers', () => {
    it('.trim strips what the user typed around the value', () => {
        const name = signal('');
        const el = mount(html`<input ::value.trim=${name} />`).querySelector('input')!;

        el.value = '  Ada  ';
        el.dispatchEvent(new Event('input'));

        expect(name()).toBe('Ada');
    });

    it('.number turns the string into a number, and a non-number into 0', () => {
        const qty = signal<unknown>(0);
        const el = mount(html`<input ::value.number=${qty} />`).querySelector('input')!;

        el.value = '42';
        el.dispatchEvent(new Event('input'));
        expect(qty()).toBe(42);

        el.value = 'abc';
        el.dispatchEvent(new Event('input'));
        expect(qty(), 'a non-numeric entry produced NaN in the model').toBe(0);
    });

    it('.lazy waits for change instead of following every keystroke', () => {
        const name = signal('');
        const el = mount(html`<input ::value.lazy=${name} />`).querySelector('input')!;

        el.value = 'half';
        el.dispatchEvent(new Event('input'));
        expect(name(), 'lazy still updated on input').toBe('');

        el.dispatchEvent(new Event('change'));
        expect(name()).toBe('half');
    });

    it('a select syncs on change', () => {
        const chosen = signal('a');
        const host = mount(html`<select ::value=${chosen}><option value="a"></option><option value="b"></option></select>`);
        const el = host.querySelector('select')!;

        el.value = 'b';
        el.dispatchEvent(new Event('change'));
        expect(chosen()).toBe('b');
    });

    it('a custom element with .lazy listens only to pdx-change', () => {
        const v = signal('');
        const el = mount(html`<pdx-thing ::value.lazy=${v}></pdx-thing>`).firstElementChild!;

        el.dispatchEvent(new CustomEvent('pdx-input', { detail: { value: 'typing' } }));
        expect(v()).toBe('');

        el.dispatchEvent(new CustomEvent('pdx-change', { detail: { value: 'committed' } }));
        expect(v()).toBe('committed');
    });

    it('a custom element that carries no detail falls back to reading the property', () => {
        const v = signal('');
        const el = mount(html`<pdx-thing ::value=${v}></pdx-thing>`).firstElementChild!;

        (el as unknown as { value: string }).value = 'from-the-property';
        el.dispatchEvent(new CustomEvent('pdx-input'));

        expect(v()).toBe('from-the-property');
    });

    it('a kebab-case two-way name becomes a camelCase property', () => {
        const v = signal('x');
        const el = mount(html`<pdx-thing ::my-value=${v}></pdx-thing>`).firstElementChild!;
        expect((el as unknown as { myValue: string }).myValue).toBe('x');
    });
});

describe('event modifiers', () => {
    it('.capture fires before the target handler', () => {
        const order: string[] = [];
        const host = mount(html`<div @click.capture=${() => order.push('parent')}><button @click=${() => order.push('child')}>x</button></div>`);

        host.querySelector('button')!.click();

        expect(order).toEqual(['parent', 'child']);
    });

    it('.delete accepts both Delete and Backspace', () => {
        const seen: string[] = [];
        const el = mount(html`<input @keydown.delete=${(e: KeyboardEvent) => seen.push(e.key)} />`).querySelector('input')!;

        for (const key of ['Delete', 'Backspace', 'a']) {
            el.dispatchEvent(new KeyboardEvent('keydown', { key }));
        }

        expect(seen).toEqual(['Delete', 'Backspace']);
    });

    // One block rather than a loop over the modifiers: the modifier is part of the attribute
    // NAME, and a placeholder there is parsed as markup, not as a binding.
    it('each arrow, tab and space filter passes only its own key', () => {
        const up = vi.fn(), down = vi.fn(), left = vi.fn(), right = vi.fn(), tab = vi.fn(), space = vi.fn();
        const host = mount(html`<div>
            <input id="k-up" @keydown.up=${up} />
            <input id="k-down" @keydown.down=${down} />
            <input id="k-left" @keydown.left=${left} />
            <input id="k-right" @keydown.right=${right} />
            <input id="k-tab" @keydown.tab=${tab} />
            <input id="k-space" @keydown.space=${space} />
        </div>`);

        const send = (id: string, key: string) =>
            host.querySelector(`#k-${id}`)!.dispatchEvent(new KeyboardEvent('keydown', { key }));

        const cases: [string, string, ReturnType<typeof vi.fn>][] = [
            ['up', 'ArrowUp', up], ['down', 'ArrowDown', down], ['left', 'ArrowLeft', left],
            ['right', 'ArrowRight', right], ['tab', 'Tab', tab], ['space', ' ', space],
        ];
        for (const [id, key, fn] of cases) {
            send(id, 'z');
            expect(fn, `.${id} fired on the wrong key`).not.toHaveBeenCalled();
            send(id, key);
            expect(fn, `.${id} did not fire on its own key`).toHaveBeenCalledTimes(1);
        }
    });

    it('a key filter does not block a non-keyboard event on the same handler', () => {
        const fn = vi.fn();
        const el = mount(html`<div @click.self=${fn}>x</div>`).querySelector('div')!;
        el.click();
        expect(fn).toHaveBeenCalled();
    });

    it('.passive is accepted, and the handler still runs', () => {
        const fn = vi.fn();
        const el = mount(html`<div @touchstart.passive=${fn}>x</div>`).querySelector('div')!;
        el.dispatchEvent(new Event('touchstart'));
        expect(fn).toHaveBeenCalled();
    });
});

describe('what an interpolated value can be', () => {
    it('a node is inserted as itself', () => {
        const span = document.createElement('span');
        span.textContent = 'node';
        expect(mount(html`<div>${span}</div>`).querySelector('span')!.textContent).toBe('node');
    });

    it('a fragment contributes all its children', () => {
        const frag = document.createDocumentFragment();
        frag.appendChild(document.createElement('b'));
        frag.appendChild(document.createElement('i'));
        const box = mount(html`<div>${frag}</div>`).querySelector('div')!;
        expect(box.children).toHaveLength(2);
        expect([...box.children].map((c) => c.tagName)).toEqual(['B', 'I']);
    });

    it('an array is flattened, nested arrays included', () => {
        const host = mount(html`<div>${['a', ['b', 'c']]}</div>`);
        expect(host.querySelector('div')!.textContent).toBe('abc');
    });

    it('a reactive value can go from text to nodes and back', () => {
        const view = signal<unknown>('text');
        const host = mount(html`<div>${() => view()}</div>`);
        const box = host.querySelector('div')!;
        expect(box.textContent).toBe('text');

        const el = document.createElement('b');
        el.textContent = 'bold';
        view.set(el);
        expect(box.querySelector('b')!.textContent).toBe('bold');

        view.set('back to text');
        expect(box.textContent).toBe('back to text');

        view.set(null);
        expect(box.textContent, 'null left the previous nodes on screen').toBe('');
    });

    it('several nodes replace several nodes', () => {
        const items = signal(['a', 'b']);
        const host = mount(html`<div>${() => items().map((t) => { const s = document.createElement('s'); s.textContent = t; return s; })}</div>`);
        const box = host.querySelector('div')!;
        expect(box.querySelectorAll('s')).toHaveLength(2);

        items.set(['x', 'y', 'z']);
        expect(box.querySelectorAll('s')).toHaveLength(3);
        expect(box.textContent).toBe('xyz');
    });

    it('static text around an interpolation is preserved', () => {
        const host = mount(html`<div>before ${'mid'} after</div>`);
        expect(host.querySelector('div')!.textContent).toBe('before mid after');
    });

    it('false renders nothing, like null', () => {
        expect(mount(html`<div>${false}</div>`).querySelector('div')!.textContent).toBe('');
    });

    it('0 renders as "0" — it is a value, not absence', () => {
        expect(mount(html`<div>${0}</div>`).querySelector('div')!.textContent).toBe('0');
    });
});

describe('the template cache', () => {
    it('two calls of the same literal produce independent DOM', () => {
        const make = (t: string) => html`<p>${t}</p>`;
        const a = mount(make('one')).querySelector('p')!;
        const b = mount(make('two')).querySelector('p')!;

        expect(a).not.toBe(b);
        expect(a.textContent).toBe('one');
        expect(b.textContent, 'the cached template leaked the first render').toBe('two');
    });
});
