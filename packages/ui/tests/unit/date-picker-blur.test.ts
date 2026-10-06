// pdx-date-picker says when the focus leaves it: pdx-blur.
//
// A form marks a field touched on its control's pdx-blur, and shows the field's error once it is
// touched — the compiler binds `@pdx-blur` to the form field's onBlur for every control, the date
// picker included. Without it, a date that breaks a rule shows no message until the whole form is
// submitted: the intake's «ends before it starts» would stay silent on the field.
//
// Leaving means leaving the COMPONENT: moving from the typed input to its own calendar button, or
// into the calendar, is still inside it.
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, mount, tick } from './helpers';
import '../../src/date-picker/pdx-date-picker';

function blurs(el: HTMLElement): Event[] {
    const seen: Event[] = [];
    el.addEventListener('pdx-blur', (e) => seen.push(e));
    return seen;
}

/** Move the focus to `to`: happy-dom fires the focusout, with its relatedTarget, as a browser does. */
function moveFocus(_from: HTMLElement, to: HTMLElement): void {
    to.focus();
}

describe('pdx-date-picker pdx-blur', () => {
    beforeEach(cleanup);

    it('fires once when the focus leaves the component', async () => {
        const el = await mount('pdx-date-picker', { editable: '', locale: 'en-US' });
        const outside = document.createElement('button');
        document.body.appendChild(outside);
        await tick(50);
        const input = el.querySelector('input.pdx-date-picker-input') as HTMLInputElement;
        const seen = blurs(el);
        input.focus();
        moveFocus(input, outside);
        expect(seen, 'leaving the picker said nothing').toHaveLength(1);
    });

    it('control — moving to its own calendar button is not leaving it', async () => {
        const el = await mount('pdx-date-picker', { editable: '', locale: 'en-US' });
        await tick(50);
        const input = el.querySelector('input.pdx-date-picker-input') as HTMLInputElement;
        const button = el.querySelector('button.pdx-date-picker-icon') as HTMLButtonElement;
        const seen = blurs(el);
        input.focus();
        moveFocus(input, button);
        expect(seen, 'a move inside the picker was reported as leaving it').toHaveLength(0);
    });
});
