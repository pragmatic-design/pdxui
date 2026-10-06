// pdx-dropdown-menu's `trigger` slot: the element the author puts there IS the menu button.
//
// Without the slot the trigger can only be the component's own button (`label`, `icon`, `variant`,
// `size`), and a menu opened by an avatar would rebuild opening, closing, the keys, the outside click
// and the focus return by hand around a pdx-menu. With the slot, the component does that for whatever
// it is given, and without it the button is the component's own.
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/dropdown-menu/pdx-dropdown-menu';
import '../../src/menu/pdx-menu';

const ITEMS = [
    { key: 'profile', label: 'Profile' },
    { key: 'signout', label: 'Sign out' },
];

/** A dropdown whose trigger is the author's element, placed in `slot="trigger"`. */
async function mountSlotted(triggerHtml: string): Promise<{ el: HTMLElement; trigger: HTMLElement }> {
    const el = document.createElement('pdx-dropdown-menu');
    el.innerHTML = triggerHtml;
    (el as any).items = ITEMS;
    document.body.appendChild(el);
    await tick(50);
    const trigger = el.querySelector('[slot="trigger"]') as HTMLElement;
    return { el, trigger };
}

const panel = () => document.querySelector('.pdx-dropdown-menu-panel') as HTMLElement | null;
const key = (target: HTMLElement, k: string) => {
    const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
    target.dispatchEvent(ev);
    return ev;
};

describe('pdx-dropdown-menu — a slotted trigger', () => {
    beforeEach(cleanup);

    it('the slotted element is the trigger, and no button of the component is built beside it', async () => {
        const { el, trigger } = await mountSlotted('<button slot="trigger" class="avatar">AS</button>');
        expect(trigger, 'the slotted trigger is not in the dropdown').not.toBeNull();
        expect(el.querySelectorAll('button')).toHaveLength(1);
        expect(el.querySelector('slot'), 'an empty <slot> is left in the DOM').toBeNull();
    });

    it('its ARIA says it opens a menu, and follows the state', async () => {
        const { el, trigger } = await mountSlotted('<button slot="trigger">AS</button>');
        expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
        expect(trigger.hasAttribute('aria-controls')).toBe(false);

        (el as any).open();
        await tick();
        expect(trigger.getAttribute('aria-expanded')).toBe('true');
        expect(document.getElementById(trigger.getAttribute('aria-controls')!)).toBe(panel());

        (el as any).close();
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
        expect(trigger.hasAttribute('aria-controls')).toBe(false);
    });

    it('a click opens the menu, and a second click closes it', async () => {
        const { trigger } = await mountSlotted('<button slot="trigger">AS</button>');
        trigger.click();
        await tick();
        expect(panel(), 'the click on the slotted trigger opened nothing').not.toBeNull();
        trigger.click();
        await tick();
        expect(panel()).toBeNull();
    });

    it('ArrowDown opens on the first item, ArrowUp on the last', async () => {
        const { el, trigger } = await mountSlotted('<button slot="trigger">AS</button>');
        expect(key(trigger, 'ArrowDown').defaultPrevented).toBe(true);
        await tick();
        expect((document.activeElement as HTMLElement).getAttribute('data-menu-key')).toBe('profile');

        (el as any).close();
        key(trigger, 'ArrowUp');
        await tick();
        expect((document.activeElement as HTMLElement).getAttribute('data-menu-key')).toBe('signout');
    });

    it('Escape closes and gives the focus back to the slotted trigger', async () => {
        const { trigger } = await mountSlotted('<button slot="trigger">AS</button>');
        key(trigger, 'ArrowDown');
        await tick();
        key(document.activeElement as HTMLElement, 'Escape');
        expect(panel()).toBeNull();
        expect(document.activeElement, 'the focus did not come back to the trigger').toBe(trigger);
    });

    it('a choice closes and gives the focus back to it', async () => {
        const { el, trigger } = await mountSlotted('<button slot="trigger">AS</button>');
        let chosen = '';
        el.addEventListener('pdx-select', (e) => { chosen = (e as CustomEvent).detail.key; });
        key(trigger, 'ArrowDown');
        await tick();
        (panel()!.querySelector('[data-menu-key="signout"]') as HTMLElement).click();
        await tick();
        expect(chosen).toBe('signout');
        expect(panel()).toBeNull();
        expect(document.activeElement).toBe(trigger);
    });

    it('a trigger that is not a button becomes one: role, tab stop, Enter and Space', async () => {
        const { trigger } = await mountSlotted('<span slot="trigger" class="avatar">AS</span>');
        expect(trigger.getAttribute('role')).toBe('button');
        expect(trigger.tabIndex).toBe(0);

        expect(key(trigger, 'Enter').defaultPrevented).toBe(true);
        await tick();
        expect(panel(), 'Enter on the span opened nothing').not.toBeNull();
        key(document.activeElement as HTMLElement, 'Escape');
        key(trigger, ' ');
        await tick();
        expect(panel(), 'Space on the span opened nothing').not.toBeNull();
    });

    it('the slotted path does not load pdx-icon: an app shell pays for no icon set it does not name', async () => {
        // First in the file to open a menu with no icons, and nothing above imports pdx-icon: a
        // registration here can only come from the dropdown or its menu.
        const { el } = await mountSlotted('<button slot="trigger">AS</button>');
        (el as any).open();
        await tick(50);
        expect(customElements.get('pdx-icon'), 'the slotted trigger path loaded pdx-icon').toBeUndefined();
    });

    it('disabled: the slotted trigger does not open, and says so', async () => {
        const { el, trigger } = await mountSlotted('<span slot="trigger">AS</span>');
        el.setAttribute('disabled', '');
        await tick(50);
        expect(trigger.getAttribute('aria-disabled')).toBe('true');
        trigger.click();
        key(trigger, 'ArrowDown');
        await tick();
        expect(panel()).toBeNull();
    });
});

describe('pdx-dropdown-menu — control: without the slot, the button is the component\'s', () => {
    beforeEach(cleanup);

    it('builds its own button, with its label and chevron, and opens on click', async () => {
        const el = document.createElement('pdx-dropdown-menu');
        el.setAttribute('label', 'Options');
        (el as any).items = ITEMS;
        document.body.appendChild(el);
        await tick(50);

        const button = el.querySelector('button[aria-haspopup="menu"]') as HTMLButtonElement;
        expect(button).not.toBeNull();
        expect(button.textContent).toContain('Options');
        expect(button.querySelector('.pdx-dropdown-chevron')).not.toBeNull();
        expect(el.querySelector('slot'), 'an empty <slot> is left in the DOM').toBeNull();
        button.click();
        await tick();
        expect(panel()).not.toBeNull();
    });
});
