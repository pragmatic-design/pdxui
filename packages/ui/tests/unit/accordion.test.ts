// pdx-accordion wires every item it holds, with ids no other accordion on the page can share.
//
// Ids indexed inside ONE accordion (`pdx-acc-content-${i}`) would repeat in a second accordion
// on the page, and its triggers' aria-controls would point into the first one. And wiring that
// runs once, in a rAF at setup, would leave an item appended later (history that arrives on
// scroll) with no id, no aria-expanded, no region, and visible while closed.
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/accordion/pdx-accordion';

const ITEM = (label: string, open = false): string => `
    <div data-accordion-item${open ? ' data-open' : ''}>
        <button data-accordion-trigger>${label}</button>
        <div data-accordion-content>${label} body</div>
    </div>`;

function makeItem(label: string): HTMLElement {
    const host = document.createElement('div');
    host.innerHTML = ITEM(label);
    return host.firstElementChild as HTMLElement;
}

const trigger = (item: Element): HTMLElement => item.querySelector('[data-accordion-trigger]')!;
const content = (item: Element): HTMLElement => item.querySelector('[data-accordion-content]')!;

beforeEach(cleanup);

describe('pdx-accordion ids', () => {
    it('two accordions on one page generate eight distinct ids, each trigger controlling its own content', async () => {
        document.body.innerHTML = `
            <pdx-accordion id="a">${ITEM('A1', true)}${ITEM('A2')}</pdx-accordion>
            <pdx-accordion id="b">${ITEM('B1', true)}${ITEM('B2')}</pdx-accordion>`;
        await tick(30);

        const items = [...document.querySelectorAll('[data-accordion-item]')];
        expect(items).toHaveLength(4);
        const ids = items.flatMap(it => [trigger(it).id, content(it).id]);
        expect(ids.every(Boolean), `an item was left without an id: ${ids.join(', ')}`).toBe(true);
        expect(new Set(ids).size, `ids collide between the two accordions: ${ids.join(', ')}`).toBe(8);

        for (const it of items) {
            const controls = trigger(it).getAttribute('aria-controls')!;
            expect(document.getElementById(controls), `${trigger(it).textContent}'s aria-controls resolves elsewhere`).toBe(content(it));
            const labelledBy = content(it).getAttribute('aria-labelledby')!;
            expect(document.getElementById(labelledBy)).toBe(trigger(it));
        }
    });

    it('the control: ids the author wrote are kept', async () => {
        document.body.innerHTML = `<pdx-accordion>
            <div data-accordion-item>
                <button data-accordion-trigger id="faq-q">Q</button>
                <div data-accordion-content id="faq-a">A</div>
            </div></pdx-accordion>`;
        await tick(30);
        const q = document.getElementById('faq-q')!;
        expect(q.getAttribute('aria-controls')).toBe('faq-a');
        expect(document.getElementById('faq-a')!.getAttribute('aria-labelledby')).toBe('faq-q');
    });
});

describe('pdx-accordion items added after mount', () => {
    // A late item is wired by a MutationObserver, and three cases of it are measured in Chromium
    // (responsive accordion-late-items.spec.ts), not here: the item's ARIA wiring, its single tab
    // stop, and that a removed accordion stops wiring. happy-dom holds an observer's delivery
    // callback in a WeakRef, so after a GC records stop arriving: the tab-stop case would fail inside
    // a full `pnpm test`, and the removal case could not fail at all. This one does not
    // rest on the observer: the click handler toggles whatever item it is given.
    it('a late item toggles on click, and single mode closes the item that was open', async () => {
        document.body.innerHTML = `<pdx-accordion>${ITEM('2024', true)}</pdx-accordion>`;
        await tick(30);
        const acc = document.querySelector('pdx-accordion')!;
        const first = acc.querySelector('[data-accordion-item]')!;
        const late = makeItem('2023');
        acc.appendChild(late);
        await tick(30);

        trigger(late).click();
        expect(late.hasAttribute('data-open')).toBe(true);
        expect(trigger(late).getAttribute('aria-expanded')).toBe('true');
        expect(first.hasAttribute('data-open')).toBe(false);
        expect(trigger(first).getAttribute('aria-expanded')).toBe('false');
    });
});

// A disabled item does not open, and says so: its trigger carries aria-disabled, so a screen reader
// does not announce an ordinary collapsed button. It stays focusable — the APG accordion keeps a
// disabled header discoverable — and announces itself.
describe('pdx-accordion disabled items', () => {
    const DISABLED = `
        <div data-accordion-item data-disabled>
            <button data-accordion-trigger>Admin</button>
            <div data-accordion-content>Admin body</div>
        </div>`;

    it('an item with data-disabled has aria-disabled="true" on its trigger; the others none', async () => {
        document.body.innerHTML = `<pdx-accordion>${ITEM('Security')}${DISABLED}</pdx-accordion>`;
        await tick(30);
        const [security, admin] = [...document.querySelectorAll('[data-accordion-item]')];
        expect(trigger(admin).getAttribute('aria-disabled')).toBe('true');
        expect(trigger(security).hasAttribute('aria-disabled')).toBe(false);
    });

    it('follows the accordion\'s disabled prop, both ways', async () => {
        document.body.innerHTML = `<pdx-accordion>${ITEM('One')}${ITEM('Two')}</pdx-accordion>`;
        await tick(30);
        const acc = document.querySelector('pdx-accordion') as HTMLElement & { disabled: boolean };
        const triggers = [...acc.querySelectorAll('[data-accordion-trigger]')];
        acc.disabled = true;
        await tick(30);
        expect(triggers.map(t => t.getAttribute('aria-disabled'))).toEqual(['true', 'true']);
        acc.disabled = false;
        await tick(30);
        expect(triggers.map(t => t.hasAttribute('aria-disabled'))).toEqual([false, false]);
    });

    // An item's data-disabled changed after mount reaches its trigger through a MutationObserver, and
    // that case is measured in Chromium (responsive accordion-disabled.spec.ts), not here: happy-dom
    // holds an observer's callback in a WeakRef, and once it is collected records stop arriving. A test
    // of it here passes alone and fails inside the full `pnpm test`.

    it('the arrow keys reach it — focusGroup would skip an aria-disabled item — and Enter or a click does not open it', async () => {
        document.body.innerHTML = `<pdx-accordion>${ITEM('Security')}${DISABLED}</pdx-accordion>`;
        await tick(30);
        const [security, admin] = [...document.querySelectorAll('[data-accordion-item]')];
        trigger(security).focus();
        trigger(security).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        expect(document.activeElement, 'ArrowDown stepped over the disabled item').toBe(trigger(admin));
        trigger(admin).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        trigger(admin).click();
        await tick(30);
        expect(admin.hasAttribute('data-open')).toBe(false);
        expect(trigger(admin).getAttribute('aria-expanded')).toBe('false');
    });
});
