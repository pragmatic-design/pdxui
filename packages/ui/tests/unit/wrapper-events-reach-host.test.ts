// A component that wraps another one carries the inner component's events on its own host (#138).
//
// Events stay on the element that emits them unless declared to bubble. Three components counted on
// the inner element's event bubbling up through them: pdx-form-template's pdx-submit was the inner
// pdx-form's, pdx-pin-input's pdx-input and pdx-change were the inner pdx-otp-input's (its value is
// now its own model, written from the inner one's, #125), and
// pdx-toggle-group heard its toggles' pressedchange on its own host. Each now listens to the inner
// element and dispatches from its host, so a listener on the wrapper hears it and nothing above does.
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/form-template/pdx-form-template';
import '../../src/pin-input/pdx-pin-input';
import '../../src/toggle/pdx-toggle';

beforeEach(cleanup);

function heard(el: Element, type: string): CustomEvent[] {
    const seen: CustomEvent[] = [];
    el.addEventListener(type, (e) => seen.push(e as CustomEvent));
    return seen;
}

describe('a wrapper dispatches its inner component\'s events from its own host', () => {
    it('pdx-form-template: the inner pdx-form\'s pdx-submit reaches a listener on the template', async () => {
        const template = document.createElement('pdx-form-template') as HTMLElement & { schema: unknown };
        template.schema = { fields: [{ name: 'name', type: 'text', label: 'Name' }] };
        document.body.appendChild(template);
        await tick(50);
        const onTemplate = heard(template, 'pdx-submit');
        const aboveTemplate = heard(document.body, 'pdx-submit');

        const form = template.querySelector('pdx-form')!;
        form.dispatchEvent(new CustomEvent('pdx-submit', { detail: { values: { name: 'Ada' } } }));
        await tick();

        expect(onTemplate.map((e) => e.detail), 'the template\'s listener did not hear the submit').toEqual([{ values: { name: 'Ada' } }]);
        expect(onTemplate[0].target, 'the event is the template\'s, not the inner form\'s').toBe(template);
        expect(aboveTemplate, 'the submit climbed past the template').toHaveLength(0);
    });

    it('pdx-pin-input: a typed digit is the pin-input\'s own model event, value-change (#125)', async () => {
        const pin = document.createElement('pdx-pin-input');
        pin.setAttribute('length', '4');
        document.body.appendChild(pin);
        await tick(50);
        const onPin = heard(pin, 'value-change');

        const cell = pin.querySelector<HTMLInputElement>('.pdx-otp-cell')!;
        cell.value = '7';
        cell.dispatchEvent(new Event('input', { bubbles: true }));
        await tick();

        expect(onPin.length, 'the pin-input\'s listener did not hear the digit').toBeGreaterThan(0);
        expect(onPin.at(-1)!.target).toBe(pin);
        expect(onPin.at(-1)!.detail?.value).toBe('7');
    });

    it('pdx-toggle-group: pressing a toggle is a pdx-change on the group', async () => {
        document.body.innerHTML = '<pdx-toggle-group><pdx-toggle value="a">A</pdx-toggle><pdx-toggle value="b">B</pdx-toggle></pdx-toggle-group>';
        await tick(50);
        const group = document.querySelector('pdx-toggle-group')!;
        const onGroup = heard(group, 'pdx-change');

        group.querySelector<HTMLButtonElement>('pdx-toggle[value="b"] button')!.click();
        await tick();

        expect(onGroup.map((e) => e.detail?.value)).toEqual(['b']);
    });
});
