// pdx-toolbar is one tab stop with arrow keys between its controls, and it is named.
//
// APG toolbar: one tab stop, arrows and Home/End between the controls, and a control that uses the
// arrows itself keeps them — not one tab stop per control, and not every toolbar named "Toolbar".
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/toolbar/pdx-toolbar';
import '../../src/button/pdx-button';
import '../../src/select/pdx-select';
import '../../src/toggle/pdx-toggle';

beforeEach(cleanup);
afterEach(() => vi.restoreAllMocks());

async function render(html: string): Promise<HTMLElement> {
    document.body.innerHTML = html;
    await tick(30);
    await tick(30);
    return document.querySelector('pdx-toolbar') as HTMLElement;
}

function key(k: string, target: Element = document.activeElement!): KeyboardEvent {
    const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
    target.dispatchEvent(e);
    return e;
}

const FIVE = '<pdx-toolbar>' + ['One', 'Two', 'Three', 'Four', 'Five'].map(t => `<button type="button">${t}</button>`).join('') + '</pdx-toolbar>';

describe('pdx-toolbar: one tab stop, arrows between the controls', () => {
    it('five buttons are one tab stop, and ArrowRight moves to the second', async () => {
        const tb = await render(FIVE);
        const buttons = [...tb.querySelectorAll('button')];
        expect(buttons.filter(b => b.getAttribute('tabindex') === '0')).toHaveLength(1);
        expect(buttons.filter(b => b.getAttribute('tabindex') === '-1')).toHaveLength(4);
        buttons[0].focus();
        key('ArrowRight');
        expect(document.activeElement).toBe(buttons[1]);
        expect(buttons[1].getAttribute('tabindex')).toBe('0');
        expect(buttons[0].getAttribute('tabindex')).toBe('-1');
    });

    it('ArrowLeft, End and Home move too', async () => {
        const tb = await render(FIVE);
        const buttons = [...tb.querySelectorAll('button')];
        buttons[0].focus();
        key('End');
        expect(document.activeElement).toBe(buttons[4]);
        key('ArrowLeft');
        expect(document.activeElement).toBe(buttons[3]);
        key('Home');
        expect(document.activeElement).toBe(buttons[0]);
    });

    it('the controls of a pdx-button are its inner buttons, not the hosts', async () => {
        const tb = await render('<pdx-toolbar><pdx-button>Cut</pdx-button><pdx-button>Copy</pdx-button></pdx-toolbar>');
        const inner = [...tb.querySelectorAll('pdx-button > button')] as HTMLElement[];
        expect(inner).toHaveLength(2);
        expect(inner[0].getAttribute('tabindex')).toBe('0');
        expect(inner[1].getAttribute('tabindex')).toBe('-1');
        inner[0].focus();
        key('ArrowRight');
        expect(document.activeElement).toBe(inner[1]);
    });

    it('the control that took focus last is the tab stop', async () => {
        const tb = await render(FIVE);
        const buttons = [...tb.querySelectorAll('button')];
        buttons[3].focus();
        buttons[3].dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
        expect(buttons[3].getAttribute('tabindex')).toBe('0');
        expect(buttons.filter(b => b.getAttribute('tabindex') === '0')).toHaveLength(1);
    });

    it('Enter activates a button once', async () => {
        const tb = await render(FIVE);
        const buttons = [...tb.querySelectorAll('button')];
        let clicks = 0;
        buttons[0].addEventListener('click', () => clicks++);
        buttons[0].focus();
        key('Enter');
        expect(clicks).toBe(1);
    });

    it('vertical: aria-orientation, and ArrowDown moves where ArrowRight does not', async () => {
        const tb = await render(FIVE.replace('<pdx-toolbar>', '<pdx-toolbar vertical>'));
        expect(tb.getAttribute('aria-orientation')).toBe('vertical');
        const buttons = [...tb.querySelectorAll('button')];
        buttons[0].focus();
        key('ArrowRight');
        expect(document.activeElement).toBe(buttons[0]);
        key('ArrowDown');
        expect(document.activeElement).toBe(buttons[1]);
    });

    it('a text field keeps its arrow keys', async () => {
        const tb = await render('<pdx-toolbar><button type="button">Bold</button><input aria-label="Find" value="abc"></pdx-toolbar>');
        const input = tb.querySelector('input')!;
        input.focus();
        const e = key('ArrowLeft', input);
        expect(document.activeElement, 'the arrow left the field').toBe(input);
        expect(e.defaultPrevented, 'the caret could not move').toBe(false);
    });

    it('a select keeps its keys: Enter opens it and the list stays open', async () => {
        const tb = await render('<pdx-toolbar><button type="button">Bold</button><pdx-select label="Font" options=\'["Sans","Serif"]\'></pdx-select></pdx-toolbar>');
        const trigger = tb.querySelector<HTMLElement>('.pdx-select-trigger')!;
        trigger.focus();
        key('Enter', trigger);
        await tick(20);
        expect(trigger.getAttribute('aria-expanded'), 'the toolbar clicked the trigger after the select opened').toBe('true');
        key('ArrowDown', trigger);
        expect(document.activeElement, 'ArrowDown left the select').toBe(trigger);
    });
});

describe('pdx-toolbar: named', () => {
    it('the label prop names it; the default is the toolbar.label string', async () => {
        const named = await render('<pdx-toolbar label="Text formatting"><button type="button">B</button></pdx-toolbar>');
        expect(named.getAttribute('role')).toBe('toolbar');
        expect(named.getAttribute('aria-label')).toBe('Text formatting');
        const plain = await render('<pdx-toolbar><button type="button">B</button></pdx-toolbar>');
        expect(plain.getAttribute('aria-label')).toBe('Toolbar');
    });

    it('warns once about a control with no name', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        await render('<pdx-toolbar><button type="button"><svg></svg></button><button type="button" aria-label="Copy"><svg></svg></button></pdx-toolbar>');
        const mine = warn.mock.calls.filter(c => String(c[0]).startsWith('[pdx-toolbar]'));
        expect(mine).toHaveLength(1);
    });
});

describe('pdx-toggle: aria-label reaches the button', () => {
    it('a toggle showing "B" is named Bold', async () => {
        document.body.innerHTML = '<pdx-toggle aria-label="Bold"><strong>B</strong></pdx-toggle>';
        await tick(30);
        expect(document.querySelector('pdx-toggle > button')?.getAttribute('aria-label')).toBe('Bold');
    });
});
