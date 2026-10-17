// `::group` binds a group of inputs to one signal (#127): checkboxes to an array of their values,
// radios to the value of the one selected. On a component it binds the component's model.

import { describe, it, expect, afterEach } from 'vitest';
import { html, bindTwoWay } from '../src/renderer/template';
import { signal } from '../src/reactivity/signal';
import { component } from '../src/component/component';
import { model } from '../src/component/component-descriptor';

const mounted: Element[] = [];
afterEach(() => { for (const el of mounted.splice(0)) el.remove(); });
function mount(frag: Node): HTMLElement {
    const host = document.createElement('div');
    host.append(frag);
    document.body.appendChild(host);
    mounted.push(host);
    return host;
}
function click(input: HTMLInputElement): void {
    input.click();
}

describe('::group on checkboxes', () => {
    it('checks the boxes whose value the array holds, and toggling writes a new array', () => {
        const toppings = signal<string[]>(['ham']);
        const host = mount(html`
            <input type="checkbox" value="cheese" ::group=${toppings} />
            <input type="checkbox" value="ham" ::group=${toppings} />`);
        const [cheese, ham] = Array.from(host.querySelectorAll('input'));
        expect([cheese.checked, ham.checked]).toEqual([false, true]);
        const before = toppings();
        click(cheese);
        expect(toppings()).toEqual(['ham', 'cheese']);
        expect(toppings(), 'a new array, not the old one changed').not.toBe(before);
        expect(before).toEqual(['ham']);
        click(ham);
        expect(toppings()).toEqual(['cheese']);
        toppings.set(['ham']);
        expect([cheese.checked, ham.checked]).toEqual([false, true]);
    });
});

describe('::group on radios', () => {
    it('checks the radio whose value the signal holds, and selecting one writes its value', () => {
        const size = signal('small');
        const host = mount(html`
            <input type="radio" name="s" value="small" ::group=${size} />
            <input type="radio" name="s" value="large" ::group=${size} />`);
        const [small, large] = Array.from(host.querySelectorAll('input'));
        expect([small.checked, large.checked]).toEqual([true, false]);
        click(large);
        expect(size()).toBe('large');
        size.set('small');
        expect([small.checked, large.checked]).toEqual([true, false]);
    });
});

describe('the value comes after the binding', () => {
    it('a value assigned after ::group, as a row of a @for assigns it, is the one the group reads', async () => {
        const picked = signal<string[]>(['b']);
        const input = document.createElement('input');
        input.type = 'checkbox';
        mount(input);
        bindTwoWay(input, 'group', picked);
        input.value = 'b';
        await Promise.resolve();
        expect(input.checked).toBe(true);
    });
});

describe('::group on a component', () => {
    it('binds the component\'s model', () => {
        const name = `x-group-${Math.random().toString(36).slice(2)}`;
        component(name, {
            models: { value: model<string[]>(() => []) },
            setup(ctx) { ctx.expose({ add: (v: string) => ctx.value.set([...ctx.value(), v]) }); },
            render: () => html`<p>x</p>`,
        });
        const tags = signal<string[]>(['a']);
        const host = mount(html([`<${name} ::group=`, `></${name}>`] as unknown as TemplateStringsArray, tags));
        const el = host.querySelector(name) as HTMLElement & { value: string[]; add(v: string): void };
        expect(el.value).toEqual(['a']);
        el.add('b');
        expect(tags()).toEqual(['a', 'b']);
    });
});
