// A field's label names the control inside it, whichever control it is.
//
// Two traps. A component that names itself with a FALLBACK `aria-label` («Choose date», «Toggle»,
// «Add tag») outranks the label's `for`: in the accessible-name computation aria-label comes before
// a <label>. And a group — the time picker's, the radio group's — named through the first `input`
// inside it names a hidden input or one radio. The field names the element that carries the role,
// by `aria-labelledby`, which outranks both.
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/form-field/pdx-form-field';
import '../../src/input/pdx-input';
import '../../src/date-picker/pdx-date-picker';
import '../../src/switch-toggle/pdx-switch';
import '../../src/time-picker/pdx-time-picker';
import '../../src/tag-input/pdx-tag-input';
import '../../src/radio-group/pdx-radio-group';
import '../../src/radio/pdx-radio';

beforeEach(cleanup);

/** The accessible name, in the order the computation takes it: labelledby, aria-label, <label for>. */
function nameOf(el: HTMLElement): string {
    const by = el.getAttribute('aria-labelledby');
    if (by) return by.split(/\s+/).map(id => document.getElementById(id)?.textContent?.trim() ?? '').join(' ').trim();
    const own = el.getAttribute('aria-label');
    if (own) return own;
    if (el.id) {
        const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (lbl) return lbl.textContent?.trim() ?? '';
    }
    return '';
}

async function field(label: string, control: string): Promise<HTMLElement> {
    const host = document.createElement('div');
    host.innerHTML = `<pdx-form-field label="${label}">${control}</pdx-form-field>`;
    document.body.appendChild(host);
    await tick(80);
    return host;
}

describe('a pdx-form-field names its control by its label', () => {
    it('an editable date picker: its combobox is the field, not «Choose date»', async () => {
        const host = await field('Date of birth', '<pdx-date-picker editable></pdx-date-picker>');
        expect(nameOf(host.querySelector<HTMLElement>('[role="combobox"]')!)).toBe('Date of birth');
    });

    it('a switch: the field, not «Toggle»', async () => {
        const host = await field('Works remotely', '<pdx-switch></pdx-switch>');
        expect(nameOf(host.querySelector<HTMLElement>('[role="switch"]')!)).toBe('Works remotely');
    });

    it('a time picker: its group is the field; its segments keep their own names', async () => {
        const host = await field('Day starts at', '<pdx-time-picker></pdx-time-picker>');
        expect(nameOf(host.querySelector<HTMLElement>('[role="group"]')!)).toBe('Day starts at');
        expect(nameOf(host.querySelector<HTMLElement>('[role="spinbutton"]')!)).toBe('Hour');
    });

    it('a tag input: its text box is the field, not «Add tag»', async () => {
        const host = await field('Skills', '<pdx-tag-input></pdx-tag-input>');
        expect(nameOf(host.querySelector<HTMLElement>('input:not([type="hidden"])')!)).toBe('Skills');
    });

    it('a radio group: the group is the field, and no radio takes the field\'s name', async () => {
        const host = await field('Gender',
            '<pdx-radio-group><pdx-radio value="f" label="Female"></pdx-radio><pdx-radio value="m" label="Male"></pdx-radio></pdx-radio-group>');
        expect(nameOf(host.querySelector<HTMLElement>('[role="radiogroup"]')!)).toBe('Gender');
        const first = host.querySelector<HTMLElement>('input[type="radio"]')!;
        expect(nameOf(first), 'the first radio was named by the field').not.toContain('Gender');
    });

    // NOT here: a control that arrives after the field wired itself. In Chromium the date picker
    // builds its DOM a frame after the field's wiring, and the field watches its slot grow — but
    // that is a MutationObserver, and happy-dom drops an observer's callback at the first garbage
    // collection, which this suite forces on purpose. It is measured in Chromium, by
    // «every field is reached by its label» in packages/showcase/tests/employees.spec.ts.

    it('control — a plain input is still named by the label\'s for', async () => {
        const host = await field('First name', '<pdx-input></pdx-input>');
        const input = host.querySelector<HTMLElement>('input')!;
        expect(nameOf(input)).toBe('First name');
        expect(input.hasAttribute('aria-labelledby'), 'a plain input needs no labelledby').toBe(false);
    });
});
