// html`` rendered to a string is what the client builds from the same template (#160, part 2).
//
// Static generation writes a route's HTML with `renderToString`, and hydration will adopt it (part 4),
// so the markup must be the client's: the same elements, attributes, classes, styles and text. Each
// case here renders one template twice — through the client's html`` into the DOM, and to a string
// parsed back — and compares the two canonically: attributes sorted, classes sorted, styles as the
// browser reads them, adjacent text merged, and the string's `<!--pdx-->` part markers set aside.

import { describe, it, expect } from 'vitest';
import { html } from '../src/renderer/template';
import { renderToString, renderToStringWithReport, PART_OPEN, PART_CLOSE } from '../src/server/render-string';
import { when } from '../src/renderer/helpers';
import { children, parity } from './string-parity';
import { signal } from '../src/reactivity/signal';
import { component } from '../src/component/component';
import { prop } from '../src/component/component-descriptor';


describe('html`` to a string matches the client', () => {
    it('static markup, void elements, comments and a self-closed element', () => {
        parity(() => html`<section class="a"><h1>Title</h1><br><img alt="x"><!-- note --><x-y /></section>`);
    });

    it('SVG keeps the camelCase the parser puts back', () => {
        parity(() => html`<svg viewBox="0 0 10 10"><linearGradient id="g"></linearGradient><path d=${'M0 0L10 10'}/></svg>`);
    });

    it('text values: primitives, null and false as nothing, escaping', () => {
        const m = parity(() => html`<p>${'a < b & c'} ${0} ${null}${false}${undefined} ${42}</p>`);
        expect(m).toContain('a &lt; b &amp; c');
    });

    it('a function value is read once, a signal as its value', () => {
        const name = signal('Ada');
        parity(() => html`<p>Hello ${() => name()}, ${name}</p>`);
    });

    it('nested templates and lists', () => {
        const items = ['one', 'two', 'three'];
        parity(() => html`<ul>${items.map((i) => html`<li class="item">${i}</li>`)}</ul>`);
        parity(() => html`<div>${html`<b>${'x'}</b>`}${[]}</div>`);
    });

    it('plain attributes: whole, mixed, boolean, class, style object, URLs', () => {
        parity(() => html`<a id=${'link'} title="Go ${'home'} now" hidden=${false} href=${'/home'}>x</a>`);
        parity(() => html`<button disabled=${true} class=${'btn primary'}>b</button>`);
        parity(() => html`<div style=${{ color: 'red', marginTop: '4px' }}></div>`);
        const m = parity(() => html`<a href=${'javascript:alert(1)'}>x</a>`);
        expect(m).not.toContain('javascript');
    });

    it('an attribute value is escaped', () => {
        const m = parity(() => html`<div title=${'"><script>x</script>'}></div>`);
        expect(m).not.toContain('<script>');
    });

    it(':prop on a plain element: class merge, aria/data, style, textContent, value', () => {
        // One dynamic class: with two, happy-dom's client render drops the first, its classList stuck
        // at the pre-binding value (template-more.test.ts); Chromium holds two, class-toggle-binding.spec.ts.
        parity(() => html`<div class="static" :class=${'dyn'}></div>`);
        parity(() => html`<div :aria-label=${'Close'} :data-id=${7} :aria-hidden=${null}></div>`);
        parity(() => html`<div :style=${'color: blue'}></div>`);
        parity(() => html`<span :textContent=${'<b>t</b>'}></span>`);
        parity(() => html`<input :disabled=${true} :placeholder=${'Name'} :title=${() => 'T'}>`);
    });

    it('a field\'s state: the string writes what the client holds as a property', () => {
        // The client assigns `value` and `checked` as properties, which its serialisation does not show;
        // the string must write them, or a pre-rendered field reads empty until the script runs. So the
        // two agree on the state each element holds once parsed, not on their serialisation.
        const render = () => html`<textarea :value=${'note'}></textarea><input :value=${'Ada'}><input type="checkbox" :checked=${true}>`;
        const client = document.createElement('div');
        client.appendChild(render());
        const server = document.createElement('div');
        server.innerHTML = renderToString(render);
        const state = (box: Element) => [
            (box.querySelector('textarea') as HTMLTextAreaElement).value,
            (box.querySelector('input:not([type])') as HTMLInputElement).value,
            (box.querySelector('input[type=checkbox]') as HTMLInputElement).checked,
        ];
        expect(state(server)).toEqual(state(client));
        expect(state(server)).toEqual(['note', 'Ada', true]);
    });

    it(':class.x, :style.x and :show', () => {
        parity(() => html`<div class="a" :class.on=${true} :class.off=${false}></div>`);
        parity(() => html`<div :style.color=${'red'} :style.width=${() => '10px'}></div>`);
        parity(() => html`<div :show=${false}>hidden</div><div :show=${true}>shown</div>`);
    });
it('a static style with no closing semicolon, merged with a bound one', () => {        const m = parity(() => html`<div style="color: red" :style.width=${'10px'} :show=${false}>x</div>`);        expect(m).toContain('color: red; width: 10px; display: none;');    });

    it('events, refs and attachments write nothing', () => {
        const ref = signal<Element | null>(null);
        const m = parity(() => html`<button @click=${() => {}} :ref=${ref}>b</button>`);
        expect(m).not.toMatch(/@click|:ref/);
        // The parity check's client render set it; the server render alone must not.
        ref.set(null);
        renderToString(() => html`<button :ref=${ref}>b</button>`);
        expect(ref.peek(), 'the server render sets no ref').toBeNull();
    });

    it('a component prop writes no attribute, as the client assigns it as a property', () => {
        parity(() => html`<x-card :items=${[1, 2]} :label=${'L'}></x-card>`);
    });
});

describe('a component to a string matches the client\'s mount', () => {
    /** The client mounts `render()` into the page; the server renders it. Hosts compared without the server's mark. */
    function mountParity(render: () => DocumentFragment): string {
        const page = document.createElement('div');
        document.body.appendChild(page);
        page.appendChild(render());
        const a = document.createElement('div');
        a.innerHTML = page.innerHTML;
        page.remove();
        const markup = renderToString(render);
        const b = document.createElement('div');
        b.innerHTML = markup;
        for (const el of Array.from(b.querySelectorAll('[data-pdx-ssr]'))) el.removeAttribute('data-pdx-ssr');
        expect(children(b), `markup: ${markup}`).toBe(children(a));
        return markup;
    }

    it('props from attributes, setup, its template, a host binding and a variant axis', () => {
        component('parity-card', {
            props: { label: prop('none'), count: prop(0, { type: Number }) },
            variants: { size: ['md', 'lg'] },
            host: { role: 'group', ':aria-label': (c: { label: () => string }) => c.label() },
            setup: (ctx) => ({ double: () => ctx.count() * 2 }),
            render: (ctx) => html`<div class="card"><h2>${ctx.label}</h2><span>${() => ctx.double()}</span></div>`,
        });
        const markup = mountParity(() => html`<parity-card label="Hi" count="3" size="lg"></parity-card>`);
        // Rendered, not two empty hosts that agree.
        expect(markup).toContain('data-pdx-ssr');
        expect(markup).toMatch(/<h2><!--pdx-->Hi<!--\/pdx--><\/h2>/);
        expect(markup).toMatch(/<span><!--pdx-->6<!--\/pdx--><\/span>/);
        expect(markup).toMatch(/role="group"/);
        expect(markup).toMatch(/aria-label="Hi"/);
    });

    it('a default and a named slot, and a slot left with its own content', () => {
        component('parity-panel', {
            render: () => html`<header><slot name="title">Untitled</slot></header><main><slot></slot></main><footer><slot name="foot">none</slot></footer>`,
        });
        const markup = mountParity(() => html`<parity-panel><b slot="title">T</b><p>body</p></parity-panel>`);
        // What each slot received, bracketed for hydration with the host's id and the slot's name.
        expect(markup).toContain('<header><!--pdx-slot:1:title--><b slot="title">T</b><!--/pdx-slot--></header>');
        expect(markup).toContain('<main><!--pdx-slot:1:--><p>body</p><!--/pdx-slot--></main>');
        expect(markup).toContain('<footer><slot name="foot">none</slot></footer>');
    });

    it('a component inside a component, with a value through the parent\'s template', () => {
        component('parity-inner', { props: { text: prop('') }, render: (ctx) => html`<i>${ctx.text}</i>` });
        component('parity-outer', {
            props: { msg: prop('m') },
            render: (ctx) => html`<section><parity-inner :text=${ctx.msg}></parity-inner><slot></slot></section>`,
        });
        const markup = mountParity(() => html`<parity-outer msg="hello">x</parity-outer>`);
        expect(markup).toMatch(/<parity-inner[^>]*><i><!--pdx-->hello<!--\/pdx--><\/i><\/parity-inner>/);
    });

    it('a component whose render is a helper\'s block alone, not a template', () => {
        component('parity-choice', {
            props: { on: prop(true, { type: Boolean }) },
            render: (ctx) => when(() => ctx.on(), () => html`<b>yes</b>`, () => html`<i>no</i>`),
        });
        const { html: markup, skipped } = renderToStringWithReport(() => html`<parity-choice></parity-choice>`);
        expect(skipped).toEqual([]);
        expect(markup).toContain('<!--when--><b>yes</b><!--/when-->');
        mountParity(() => html`<parity-choice></parity-choice>`);
    });
});

describe('a bound <select> value on the server (#934)', () => {
    /** The markup, parsed as a page would be. */
    const parsed = (markup: string): HTMLSelectElement => {
        const box = document.createElement('div');
        box.innerHTML = markup;
        return box.querySelector('select')!;
    };

    it('marks the option it names selected, and writes no value on the <select>', () => {
        const markup = renderToString(() => html`<select :value=${'b'}><option value="a">A</option><option value="b">B</option></select>`);
        expect(markup).toContain('<option value="b" selected>');
        expect(markup).not.toMatch(/<select[^>]*\svalue=/);
        expect(markup).not.toContain('<option value="a" selected');
        expect(parsed(markup).value).toBe('b');
    });

    it('a two-way value, and options a list renders', () => {
        const choice = signal('c');
        const options = ['a', 'b', 'c'];
        const markup = renderToString(() => html`<select ::value=${choice}>${options.map((o) => html`<option value=${o}>${o.toUpperCase()}</option>`)}</select>`);
        // The option that carries `selected`: happy-dom's select.value misreads options between the
        // part markers a list writes, where a browser selects the marked one.
        expect([...parsed(markup).querySelectorAll('option[selected]')].map((o) => o.getAttribute('value'))).toEqual(['c']);
    });

    it('an option without a value is named by its text, inside an <optgroup> too', () => {
        const markup = renderToString(() => html`<select :value=${'Two'}><optgroup label="g"><option>One</option><option> Two </option></optgroup></select>`);
        // The option, not select.value: happy-dom does not collapse the text into the value as a
        // browser does, which is the match the server makes.
        expect([...parsed(markup).querySelectorAll('option[selected]')].map((o) => o.textContent)).toEqual([' Two ']);
        expect(markup).toContain('<option selected> Two </option>');
    });

    it('an option the author marked selected keeps it only when it is the value', () => {
        const markup = renderToString(() => html`<select :value=${'b'}><option value="a" selected>A</option><option value="b">B</option></select>`);
        expect(parsed(markup).value).toBe('b');
        expect(markup).toContain('<option value="a">');
    });
});

describe('the part markers', () => {
    it('bracket every value put in content, so hydration finds text the parser merged', () => {
        const markup = renderToString(() => html`<p>a${'b'}c</p>`);
        expect(markup).toBe(`<p>a${PART_OPEN}b${PART_CLOSE}c</p>`);
    });
});
