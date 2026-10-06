// Tests for Sprint 1 quick wins: ref(), show, ::value modifiers, :class/:style shorthands

import { describe, it, expect, beforeEach } from 'vitest';
import { signal, ref, effect } from '../src/reactivity/signal';
import { html } from '../src/renderer/template';
import { show } from '../src/renderer/helpers';

describe('ref() — element reference', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it('creates a signal initialized to null', () => {
        const el = ref<HTMLDivElement>();
        expect(el()).toBeNull();
    });

    it(':ref binds element to signal', () => {
        const divRef = ref<HTMLDivElement>();
        const frag = html`<div :ref=${divRef}>Hello</div>`;
        document.body.appendChild(frag);

        expect(divRef()).not.toBeNull();
        expect(divRef()).toBeInstanceOf(HTMLDivElement);
        expect(divRef()!.textContent).toBe('Hello');
    });

    it('ref works with canvas element', () => {
        const canvasRef = ref<HTMLCanvasElement>();
        const frag = html`<canvas :ref=${canvasRef} width="100" height="100"></canvas>`;
        document.body.appendChild(frag);

        expect(canvasRef()).toBeInstanceOf(HTMLCanvasElement);
    });

    it('ref is reactive — usable in effects', () => {
        const divRef = ref<HTMLDivElement>();
        let captured: HTMLDivElement | null = null;

        effect(() => { captured = divRef(); });
        expect(captured).toBeNull();

        const frag = html`<div :ref=${divRef}>Test</div>`;
        document.body.appendChild(frag);

        expect(captured).not.toBeNull();
    });
});

describe(':show — CSS display toggle', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it(':show hides element with display:none', () => {
        const visible = signal(false);
        const frag = html`<div :show=${() => visible()}>Content</div>`;
        document.body.appendChild(frag);

        const div = document.body.querySelector('div')!;
        expect(div.style.display).toBe('none');
    });

    it(':show shows element when true', () => {
        const visible = signal(true);
        const frag = html`<div :show=${() => visible()}>Content</div>`;
        document.body.appendChild(frag);

        expect(document.body.querySelector('div')!.style.display).toBe('');
    });

    it(':show toggles reactively', () => {
        const visible = signal(true);
        const frag = html`<div :show=${() => visible()}>Content</div>`;
        document.body.appendChild(frag);

        const div = document.body.querySelector('div')!;
        expect(div.style.display).toBe('');

        visible.set(false);
        expect(div.style.display).toBe('none');

        visible.set(true);
        expect(div.style.display).toBe('');
    });

    it(':show preserves element in DOM (unlike when)', () => {
        const visible = signal(false);
        const frag = html`<div :show=${() => visible()} id="preserved">Content</div>`;
        document.body.appendChild(frag);

        // Element exists but hidden
        expect(document.body.querySelector('#preserved')).not.toBeNull();
        expect(document.body.querySelector<HTMLElement>('#preserved')!.style.display).toBe('none');
    });
});

describe('show() helper function', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it('hides content when condition is false', () => {
        const visible = signal(false);
        const frag = show(() => visible(), html`<div class="showable">Content</div>`);
        document.body.appendChild(frag);

        expect(document.body.querySelector<HTMLElement>('.showable')!.style.display).toBe('none');
    });

    it('shows content when condition is true', () => {
        const visible = signal(true);
        const frag = show(() => visible(), html`<div class="showable">Content</div>`);
        document.body.appendChild(frag);

        expect(document.body.querySelector<HTMLElement>('.showable')!.style.display).toBe('');
    });

    it('toggles reactively', () => {
        const visible = signal(true);
        const frag = show(() => visible(), html`<div class="showable">Content</div>`);
        document.body.appendChild(frag);

        visible.set(false);
        expect(document.body.querySelector<HTMLElement>('.showable')!.style.display).toBe('none');

        visible.set(true);
        expect(document.body.querySelector<HTMLElement>('.showable')!.style.display).toBe('');
    });
});

describe('::value modifiers', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it('::value.trim trims whitespace', () => {
        const name = signal('');
        const frag = html`<input ::value.trim=${name}>`;
        document.body.appendChild(frag);
        const input = document.body.querySelector('input')!;

        input.value = '  hello  ';
        input.dispatchEvent(new Event('input'));
        expect(name()).toBe('hello');
    });

    it('::value.number converts to number', () => {
        const age = signal(0);
        const frag = html`<input ::value.number=${age}>`;
        document.body.appendChild(frag);
        const input = document.body.querySelector('input')!;

        input.value = '42';
        input.dispatchEvent(new Event('input'));
        expect(age()).toBe(42);
    });

    it('::value.number returns 0 for non-numeric', () => {
        const val = signal(0);
        const frag = html`<input ::value.number=${val}>`;
        document.body.appendChild(frag);
        const input = document.body.querySelector('input')!;

        input.value = 'abc';
        input.dispatchEvent(new Event('input'));
        expect(val()).toBe(0);
    });

    it('::value.lazy uses change event instead of input', () => {
        const search = signal('');
        const frag = html`<input ::value.lazy=${search}>`;
        document.body.appendChild(frag);
        const input = document.body.querySelector('input')!;

        input.value = 'hello';
        input.dispatchEvent(new Event('input'));
        expect(search()).toBe(''); // not updated on input

        input.dispatchEvent(new Event('change'));
        expect(search()).toBe('hello'); // updated on change
    });

    it('::value.trim.number chains modifiers', () => {
        const price = signal(0);
        const frag = html`<input ::value.trim.number=${price}>`;
        document.body.appendChild(frag);
        const input = document.body.querySelector('input')!;

        input.value = '  99.50  ';
        input.dispatchEvent(new Event('input'));
        expect(price()).toBe(99.5);
    });
});

describe(':class.name toggle', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it('adds class when true', () => {
        const active = signal(true);
        const frag = html`<div :class.active=${() => active()}>Test</div>`;
        document.body.appendChild(frag);
        expect(document.body.querySelector('div')!.classList.contains('active')).toBe(true);
    });

    it('removes class when false', () => {
        const active = signal(false);
        const frag = html`<div :class.active=${() => active()}>Test</div>`;
        document.body.appendChild(frag);
        expect(document.body.querySelector('div')!.classList.contains('active')).toBe(false);
    });

    it('toggles class reactively', () => {
        const active = signal(false);
        const frag = html`<div :class.active=${() => active()}>Test</div>`;
        document.body.appendChild(frag);
        const div = document.body.querySelector('div')!;

        expect(div.classList.contains('active')).toBe(false);
        active.set(true);
        expect(div.classList.contains('active')).toBe(true);
        active.set(false);
        expect(div.classList.contains('active')).toBe(false);
    });

    it('multiple class toggles on same element', () => {
        const a = signal(true);
        const b = signal(false);
        const frag = html`<div :class.foo=${() => a()} :class.bar=${() => b()}>Test</div>`;
        document.body.appendChild(frag);
        const div = document.body.querySelector('div')!;

        expect(div.classList.contains('foo')).toBe(true);
        expect(div.classList.contains('bar')).toBe(false);

        b.set(true);
        expect(div.classList.contains('bar')).toBe(true);
    });
});

describe(':style.prop binding', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it('sets inline style property', () => {
        const color = signal('red');
        const frag = html`<div :style.color=${() => color()}>Test</div>`;
        document.body.appendChild(frag);
        expect(document.body.querySelector('div')!.style.color).toBe('red');
    });

    it('updates style reactively', () => {
        const color = signal('red');
        const frag = html`<div :style.color=${() => color()}>Test</div>`;
        document.body.appendChild(frag);

        color.set('blue');
        expect(document.body.querySelector('div')!.style.color).toBe('blue');
    });
});
