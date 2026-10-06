// After a user change, a form control's own property equals the value it emitted — and it already
// does when the event is dispatched.
//
// The native contract: `input.value` is the live value, the attribute the initial one. A control that
// keeps the initial value on the property and the live one in a private signal leaves `el.value`
// stale after the user touches it. pdx-data-grid commits a cell edit by reading the editor host's
// `.value`, so a stale property throws every edit away.
//
// One case per control, all through the same check: listen for the event, read the property INSIDE
// the listener, act like a user, then read it again after the frame.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';

import '../../src/input/pdx-input';
import '../../src/textarea/pdx-textarea';
import '../../src/password-input/pdx-password-input';
import '../../src/search-input/pdx-search-input';
import '../../src/masked-input/pdx-masked-input';
import '../../src/number-input/pdx-number-input';
import '../../src/checkbox/pdx-checkbox';
import '../../src/switch-toggle/pdx-switch';
import '../../src/radio/pdx-radio';
import '../../src/slider/pdx-slider';
import '../../src/color-picker/pdx-color-picker';
import '../../src/mention/pdx-mention';
import '../../src/select/pdx-select';
import '../../src/date-picker/pdx-date-picker';
import '../../src/time-picker/pdx-time-picker';
import '../../src/rating/pdx-rating';
import '../../src/segmented/pdx-segmented';
import '../../src/tag-input/pdx-tag-input';
import '../../src/toggle/pdx-toggle';
import '../../src/button-group/pdx-button-group';
import '../../src/inline-edit/pdx-inline-edit';
import '../../src/json-editor/pdx-json-editor';
import '../../src/calendar/pdx-calendar';
import '../../src/autocomplete/pdx-autocomplete';
import '../../src/cascader/pdx-cascader';
import '../../src/tree-select/pdx-tree-select';
import '../../src/transfer/pdx-transfer';
import '../../src/otp-input/pdx-otp-input';

type Detail = Record<string, unknown>;

interface Case {
    name: string;
    html: string;
    /** Complex props (arrays, objects) set as properties before the first build. */
    setup?: (el: HTMLElement & Record<string, unknown>) => void;
    /** What a user does. */
    act: (el: HTMLElement) => void | Promise<void>;
    /** The event whose detail carries the new value. */
    event: string;
    /** property name → the value it must hold, from the event's detail. */
    props: Record<string, (d: Detail) => unknown>;
}

function typeInto(field: HTMLInputElement | HTMLTextAreaElement, text: string, events: string[] = ['input']): void {
    field.value = text;
    for (const type of events) field.dispatchEvent(new Event(type, { bubbles: true }));
}

function key(target: Element, k: string): void {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
}

function check(el: HTMLElement, input: HTMLInputElement): void {
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    void el;
}

const q = <T extends Element>(el: Element, sel: string): T => {
    const found = el.querySelector<T>(sel);
    if (!found) throw new Error(`no ${sel} in ${el.tagName.toLowerCase()}`);
    return found;
};

const CASES: Case[] = [
    {
        name: 'pdx-input, typing', html: '<pdx-input></pdx-input>', event: 'pdx-input',
        act: (el) => typeInto(q(el, 'input'), 'typed text'),
        props: { value: (d) => d.value },
    },
    {
        name: 'pdx-input, committing', html: '<pdx-input value="start"></pdx-input>', event: 'pdx-change',
        act: (el) => typeInto(q(el, 'input'), 'committed', ['input', 'change']),
        props: { value: (d) => d.value },
    },
    {
        name: 'pdx-textarea', html: '<pdx-textarea></pdx-textarea>', event: 'pdx-change',
        act: (el) => typeInto(q(el, 'textarea'), 'two\nlines', ['input', 'change']),
        props: { value: (d) => d.value },
    },
    {
        name: 'pdx-password-input', html: '<pdx-password-input></pdx-password-input>', event: 'pdx-input',
        act: (el) => typeInto(q(el, 'input'), 's3cret'),
        props: { value: (d) => d.value },
    },
    {
        name: 'pdx-search-input', html: '<pdx-search-input></pdx-search-input>', event: 'pdx-input',
        act: (el) => typeInto(q(el, 'input'), 'query'),
        props: { value: (d) => d.value },
    },
    {
        name: 'pdx-masked-input (the unmasked value)', html: '<pdx-masked-input mask="phone"></pdx-masked-input>', event: 'pdx-input',
        act: (el) => typeInto(q(el, 'input'), '5551234567'),
        props: { value: (d) => d.value },
    },
    {
        name: 'pdx-number-input, typing', html: '<pdx-number-input max="1000"></pdx-number-input>', event: 'pdx-input',
        act: (el) => typeInto(q(el, 'input'), '42'),
        props: { value: (d) => d.value },
    },
    {
        name: 'pdx-checkbox', html: '<pdx-checkbox value="yes"></pdx-checkbox>', event: 'pdx-change',
        act: (el) => check(el, q(el, 'input[type="checkbox"]')),
        props: { checked: (d) => d.checked },
    },
    {
        name: 'pdx-switch', html: '<pdx-switch value="on"></pdx-switch>', event: 'pdx-change',
        act: (el) => check(el, q(el, 'input[type="checkbox"]')),
        props: { checked: (d) => d.checked },
    },
    {
        name: 'pdx-radio', html: '<pdx-radio value="a"></pdx-radio>', event: 'pdx-change',
        act: (el) => check(el, q(el, 'input[type="radio"]')),
        props: { checked: () => true },
    },
    {
        name: 'pdx-slider', html: '<pdx-slider value="10" min="0" max="100" step="1"></pdx-slider>', event: 'pdx-change',
        act: (el) => key(el, 'ArrowRight'),
        props: { value: (d) => d.value },
    },
    {
        name: 'pdx-color-picker', html: '<pdx-color-picker value="#ff0000" inline></pdx-color-picker>', event: 'pdx-change',
        act: (el) => typeInto(q(el, '.pdx-color-hex-input'), '#00ff00', ['change']),
        props: { value: (d) => d.value },
    },
    {
        name: 'pdx-mention (the text)', html: '<pdx-mention></pdx-mention>', event: 'pdx-input',
        act: (el) => typeInto(q(el, 'textarea'), 'hello there'),
        props: { value: (d) => d.value },
    },
    {
        name: 'pdx-select', html: `<pdx-select options='["Red","Green","Blue"]'></pdx-select>`, event: 'pdx-change',
        act: async (el) => {
            q<HTMLElement>(el, '.pdx-select-trigger').click();
            await tick();
            (el.querySelectorAll<HTMLElement>('.pdx-select-option')[1]).click();
        },
        props: { value: (d) => d.value },
    },
    {
        name: 'pdx-date-picker, a date', html: '<pdx-date-picker inline></pdx-date-picker>', event: 'pdx-change',
        act: (el) => { q(el, 'pdx-calendar').dispatchEvent(new CustomEvent('pdx-change', { detail: { value: '2026-09-14' } })); },
        props: { value: (d) => d.value },
    },
    {
        name: 'pdx-date-picker, a range', html: '<pdx-date-picker inline mode="range"></pdx-date-picker>', event: 'pdx-change',
        act: (el) => {
            q(el, 'pdx-calendar').dispatchEvent(new CustomEvent('pdx-change', { detail: { rangeStart: '2026-09-01', rangeEnd: '2026-09-05' } }));
        },
        props: { rangeStart: (d) => d.rangeStart, rangeEnd: (d) => d.rangeEnd },
    },
    {
        name: 'pdx-time-picker', html: '<pdx-time-picker></pdx-time-picker>', event: 'pdx-change',
        act: (el) => key(el.querySelectorAll('[role="spinbutton"]')[0], 'ArrowUp'),
        props: { value: (d) => d.value },
    },
    {
        name: 'pdx-rating', html: '<pdx-rating value="2"></pdx-rating>', event: 'change',
        act: (el) => key(q(el, '.pdx-rating'), 'ArrowRight'),
        props: { value: (d) => d.value },
    },
    {
        name: 'pdx-segmented', html: `<pdx-segmented options='["Day","Week","Month"]' value="Day"></pdx-segmented>`, event: 'pdx-change',
        act: (el) => (el.querySelectorAll<HTMLElement>('.pdx-segmented-item')[1]).click(),
        props: { value: (d) => d.value },
    },
    {
        name: 'pdx-tag-input', html: '<pdx-tag-input></pdx-tag-input>', event: 'pdx-change',
        act: (el) => {
            const field = q<HTMLInputElement>(el, 'input');
            typeInto(field, 'urgent');
            key(field, 'Enter');
        },
        props: { value: (d) => d.tags },
    },
    {
        name: 'pdx-toggle', html: '<pdx-toggle value="bold">B</pdx-toggle>', event: 'pdx-pressed-change',
        act: (el) => q<HTMLButtonElement>(el, 'button').click(),
        props: { pressed: (d) => d.pressed },
    },
    {
        name: 'pdx-toggle-group',
        html: '<pdx-toggle-group><pdx-toggle value="a">A</pdx-toggle><pdx-toggle value="b">B</pdx-toggle></pdx-toggle-group>',
        event: 'pdx-change',
        act: (el) => q<HTMLButtonElement>(el, 'pdx-toggle[value="b"] button').click(),
        props: { value: (d) => d.value },
    },
    {
        name: 'pdx-button-group (the detail is the value itself)',
        html: '<pdx-button-group mode="single"><button value="x">X</button><button value="y">Y</button></pdx-button-group>',
        event: 'pdx-change',
        act: (el) => q<HTMLButtonElement>(el, 'button[value="y"]').click(),
        props: { value: (d) => d },
    },
    {
        name: 'pdx-inline-edit (boolean)', html: '<pdx-inline-edit type="boolean"></pdx-inline-edit>', event: 'pdx-change',
        setup: (el) => { el.value = false; },
        act: (el) => q<HTMLElement>(el, '.pdx-inline-edit-display').click(),
        props: { value: (d) => d.value },
    },
    {
        name: 'pdx-json-editor', html: '<pdx-json-editor></pdx-json-editor>', event: 'pdx-change',
        setup: (el) => { el.schema = { label: 'Profile', fields: [{ k: 'name', label: 'Name' }] }; el.value = { name: 'Grace' }; },
        act: (el) => typeInto(q(el, 'input'), 'Ada'),
        props: { value: (d) => d.value },
    },
    {
        name: 'pdx-calendar, a date', html: '<pdx-calendar inline value="2026-09-10"></pdx-calendar>', event: 'pdx-change',
        act: (el) => q<HTMLElement>(el, '[data-iso="2026-09-15"]').click(),
        props: { value: (d) => d.value },
    },
    {
        name: 'pdx-calendar, a range', html: '<pdx-calendar inline mode="range" value="2026-09-10"></pdx-calendar>', event: 'pdx-change',
        act: (el) => {
            q<HTMLElement>(el, '[data-iso="2026-09-12"]').click();
            q<HTMLElement>(el, '[data-iso="2026-09-15"]').click();
        },
        props: { rangeStart: (d) => d.rangeStart, rangeEnd: (d) => d.rangeEnd },
    },
    {
        name: 'pdx-autocomplete, typing', html: '<pdx-autocomplete></pdx-autocomplete>', event: 'pdx-input',
        act: (el) => typeInto(q(el, 'input:not([type="hidden"])'), 'Rom'),
        props: { value: (d) => d.value },
    },
    {
        name: 'pdx-cascader', html: '<pdx-cascader></pdx-cascader>', event: 'pdx-change',
        setup: (el) => { el.options = [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]; },
        act: async (el) => {
            q<HTMLElement>(el, '.pdx-cascader-trigger').click();
            await tick();
            (el.querySelectorAll<HTMLElement>('.pdx-cascader-item')[1]).click();
        },
        props: { value: (d) => d.value },
    },
    {
        name: 'pdx-tree-select', html: '<pdx-tree-select></pdx-tree-select>', event: 'pdx-change',
        setup: (el) => { el.options = [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]; },
        act: async (el) => {
            q<HTMLElement>(el, '[role="combobox"]').click();
            await tick();
            (el.querySelectorAll<HTMLElement>('[role="treeitem"]')[1]).click();
        },
        props: { value: (d) => d.value },
    },
    {
        name: 'pdx-transfer', html: '<pdx-transfer></pdx-transfer>', event: 'pdx-change',
        setup: (el) => { el.items = [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]; el.value = ['b']; },
        act: async (el) => {
            const source = el.querySelectorAll('.pdx-transfer-panel')[0];
            q<HTMLElement>(source, '.pdx-transfer-item').click();
            await tick();
            (el.querySelectorAll<HTMLButtonElement>('.pdx-transfer-btn')[0]).click();
        },
        props: { value: (d) => d.value },
    },
    {
        name: 'pdx-otp-input', html: '<pdx-otp-input length="4"></pdx-otp-input>', event: 'pdx-input',
        act: (el) => typeInto(q(el, '.pdx-otp-cell'), '7'),
        props: { value: (d) => d.value },
    },
];

beforeEach(cleanup);

describe('after a user change, the property is the emitted value', () => {
    for (const c of CASES) {
        it(c.name, async () => {
            document.body.innerHTML = c.html;
            const el = document.body.firstElementChild as HTMLElement;
            if (c.setup) c.setup(el as HTMLElement & Record<string, unknown>);
            await tick(c.setup ? 200 : 50);
            const read = (name: string): unknown => (el as unknown as Record<string, unknown>)[name];

            let detail: Detail | null = null;
            const atEmit: Record<string, unknown> = {};
            el.addEventListener(c.event, (e) => {
                detail = (e as CustomEvent<Detail>).detail;
                for (const name of Object.keys(c.props)) atEmit[name] = read(name);
            });

            await c.act(el);
            await tick();

            expect(detail, `${c.event} was not emitted`).not.toBeNull();
            for (const [name, from] of Object.entries(c.props)) {
                const expected = from(detail!);
                expect(atEmit[name], `el.${name} when ${c.event} was dispatched`).toEqual(expected);
                expect(read(name), `el.${name} after the frame`).toEqual(expected);
            }
        });
    }
});

// Some controls rebuild their DOM when `value` changes. Writing the user's value back to `value`
// must not rebuild them under the user's hands: they recognise their own reflection.
describe('writing the value back does not rebuild the control being used', () => {
    it('pdx-otp-input: the cells survive a digit, and focus moves on to the next one', async () => {
        document.body.innerHTML = '<pdx-otp-input length="4"></pdx-otp-input>';
        await tick(50);
        const el = document.body.firstElementChild as HTMLElement;
        const before = Array.from(el.querySelectorAll('.pdx-otp-cell'));
        (before[0] as HTMLInputElement).focus();
        typeInto(before[0] as HTMLInputElement, '7');
        await tick();
        const after = Array.from(el.querySelectorAll('.pdx-otp-cell'));
        expect(after.every((c, i) => c === before[i]), 'the cells were rebuilt').toBe(true);
        expect(document.activeElement).toBe(before[1]);
    });

    it('pdx-json-editor: the field being typed in is the same element after the edit', async () => {
        document.body.innerHTML = '<pdx-json-editor></pdx-json-editor>';
        const el = document.body.firstElementChild as HTMLElement & Record<string, unknown>;
        el.schema = { label: 'Profile', fields: [{ k: 'name', label: 'Name' }] };
        el.value = { name: 'Grace' };
        await tick(200);
        const field = q<HTMLInputElement>(el, 'input');
        typeInto(field, 'Ada');
        await tick(50);
        expect(field.isConnected, 'the editor was rebuilt').toBe(true);
        expect(q(el, 'input')).toBe(field);
        expect(el.value).toEqual({ name: 'Ada' });
    });

    it('control: a value set by the parent still rebuilds the editor', async () => {
        document.body.innerHTML = '<pdx-json-editor></pdx-json-editor>';
        const el = document.body.firstElementChild as HTMLElement & Record<string, unknown>;
        el.schema = { label: 'Profile', fields: [{ k: 'name', label: 'Name' }] };
        el.value = { name: 'Grace' };
        await tick(200);
        el.value = { name: 'Linus' };
        await tick(200);
        expect(q<HTMLInputElement>(el, 'input').value).toBe('Linus');
    });
});
