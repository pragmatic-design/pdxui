import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/tabs/pdx-tabs';

describe('pdx-tabs', () => {
    beforeEach(cleanup);

    function createTabs(activeValue = '') {
        const el = document.createElement('pdx-tabs');
        if (activeValue) el.setAttribute('value', activeValue);
        el.innerHTML = `
            <div role="tablist">
                <button data-tab="one">One</button>
                <button data-tab="two">Two</button>
                <button data-tab="three">Three</button>
            </div>
            <div data-tab-panel="one">Panel One</div>
            <div data-tab-panel="two">Panel Two</div>
            <div data-tab-panel="three">Panel Three</div>
        `;
        document.body.appendChild(el);
        return el;
    }

    it('activates first tab by default', async () => {
        const el = createTabs();
        await tick(50);
        const tabs = el.querySelectorAll('[data-tab]');
        expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
    });

    it('activates tab matching value prop', async () => {
        const el = createTabs('two');
        await tick(50);
        const tabs = el.querySelectorAll('[data-tab]');
        expect(tabs[1]?.getAttribute('aria-selected')).toBe('true');
    });

    it('reacts to external value prop change', async () => {
        const el = createTabs('one');
        await tick(50);

        (el as any).value = 'three';
        await tick(50);

        const tabs = el.querySelectorAll('[data-tab]');
        expect(tabs[2]?.getAttribute('aria-selected')).toBe('true');
    });

    it('click activates tab', async () => {
        const el = createTabs();
        await tick(50);

        const tabs = el.querySelectorAll('[data-tab]');
        (tabs[1] as HTMLElement).click();
        await tick();

        expect(tabs[1]?.getAttribute('aria-selected')).toBe('true');
    });

    it('sets ARIA roles on tabs and panels', async () => {
        const el = createTabs();
        await tick(50);

        const tabs = el.querySelectorAll('[data-tab]');
        const panels = el.querySelectorAll('[data-tab-panel]');

        expect(tabs[0]?.getAttribute('role')).toBe('tab');
        expect(panels[0]?.getAttribute('role')).toBe('tabpanel');
        expect(tabs[0]?.getAttribute('aria-controls')).toBe(panels[0]?.id);
        expect(panels[0]?.getAttribute('aria-labelledby')).toBe(tabs[0]?.id);
    });

    it('emits pdx-change on tab activation', async () => {
        const el = createTabs();
        await tick(50);

        let changedValue = '';
        el.addEventListener('pdx-change', ((e: CustomEvent) => {
            changedValue = e.detail?.value ?? e.detail;
        }) as EventListener);

        const tabs = el.querySelectorAll('[data-tab]');
        (tabs[1] as HTMLElement).click();
        await tick();

        expect(changedValue).toBe('two');
    });

    it('stays clickable after a prop change post-mount', async () => {
        const el = createTabs('one');
        await tick(50);

        // A prop change used to re-run the bind track, tear down the click listener/focusGroup,
        // then skip the rebind (`if(!_bound)`), leaving tabs permanently dead.
        (el as any).value = 'two';
        await tick(50);

        const tabs = el.querySelectorAll('[data-tab]');
        // Now click a DIFFERENT tab — must still activate.
        (tabs[2] as HTMLElement).click();
        await tick();

        expect(tabs[2]?.getAttribute('aria-selected')).toBe('true');
        expect(tabs[1]?.getAttribute('aria-selected')).toBe('false');
    });

    it('emits pdx-change on click after a prop change', async () => {
        const el = createTabs('one');
        await tick(50);
        (el as any).loading = true; // any prop change
        await tick(50);

        let changed = '';
        el.addEventListener('pdx-change', ((e: CustomEvent) => { changed = e.detail?.value; }) as EventListener);
        const tabs = el.querySelectorAll('[data-tab]');
        (tabs[2] as HTMLElement).click();
        await tick();
        expect(changed).toBe('three');
    });

    it('cleans up ResizeObserver on disconnect', async () => {
        const el = createTabs();
        await tick(50);
        // Should not throw on removal
        el.remove();
        await tick();
    });
});

// Tab and panel ids do not come from the value alone, `pdx-tab-${value}`: two tabs on a page with a
// shared value would repeat them, and the second tabs' tabs would control the first tabs' panels. And
// an id the author wrote is kept.
describe('pdx-tabs ids', () => {
    beforeEach(cleanup);

    function tabsWith(panelAttrs = ''): HTMLElement {
        const el = document.createElement('pdx-tabs');
        el.innerHTML = `
            <div role="tablist">
                <button data-tab="general">General</button>
                <button data-tab="billing">Billing</button>
            </div>
            <div data-tab-panel="general">General settings</div>
            <div data-tab-panel="billing" ${panelAttrs}>Billing settings</div>`;
        document.body.appendChild(el);
        return el;
    }

    it('two tabs with the same values share no id, and each links inside itself', async () => {
        const a = tabsWith();
        const b = tabsWith();
        await tick(50);
        const ids = (el: Element) => [...el.querySelectorAll('[id]')].map(n => n.id);
        const shared = ids(a).filter(id => ids(b).includes(id));
        expect(shared, 'ids repeated across the two tabs').toEqual([]);
        for (const el of [a, b]) {
            for (const tab of el.querySelectorAll('[data-tab]')) {
                const panel = document.getElementById(tab.getAttribute('aria-controls')!);
                expect(el.contains(panel), `${tab.textContent} controls a panel outside its tabs`).toBe(true);
                expect(panel?.getAttribute('data-tab-panel')).toBe(tab.getAttribute('data-tab'));
            }
            for (const panel of el.querySelectorAll('[data-tab-panel]')) {
                const tab = document.getElementById(panel.getAttribute('aria-labelledby')!);
                expect(el.contains(tab)).toBe(true);
            }
        }
    });

    it('an id the author wrote on a panel stays, and its tab controls it by that id', async () => {
        const el = tabsWith('id="billing"');
        await tick(50);
        const panel = el.querySelector('[data-tab-panel="billing"]')!;
        expect(panel.id).toBe('billing');
        expect(el.querySelector('[data-tab="billing"]')!.getAttribute('aria-controls')).toBe('billing');
    });
});

// A pdx-tabs in another's panel: an outer that found its tabs and panels with querySelectorAll would
// reach the inner tabs' too, hide the inner active panel, re-select the inner tabs by its own value,
// and put them in its arrow-key order. The inner tabs share a value with the outer ones ("general")
// on purpose.
describe('pdx-tabs nested in a pdx-tabs panel', () => {
    beforeEach(cleanup);

    async function nested(): Promise<{ outer: HTMLElement; inner: HTMLElement }> {
        const outer = document.createElement('pdx-tabs');
        outer.setAttribute('value', 'general');
        outer.innerHTML = `
            <div role="tablist">
                <button data-tab="general">General</button>
                <button data-tab="advanced">Advanced</button>
            </div>
            <div data-tab-panel="general">
                <pdx-tabs value="profile">
                    <div role="tablist">
                        <button data-tab="profile">Profile</button>
                        <button data-tab="general">Security</button>
                    </div>
                    <div data-tab-panel="profile">Profile form</div>
                    <div data-tab-panel="general">Security form</div>
                </pdx-tabs>
            </div>
            <div data-tab-panel="advanced">Advanced settings</div>`;
        document.body.appendChild(outer);
        await tick(50);
        return { outer, inner: outer.querySelector('pdx-tabs pdx-tabs') as HTMLElement };
    }
    const own = (tabs: HTMLElement, sel: string) =>
        [...tabs.querySelectorAll<HTMLElement>(sel)].filter(n => n.closest('pdx-tabs') === tabs);
    const selected = (tabs: HTMLElement) =>
        own(tabs, '[data-tab]').map(t => `${t.textContent}:${t.getAttribute('aria-selected')}`);
    const shown = (tabs: HTMLElement) =>
        own(tabs, '[data-tab-panel]').filter(p => p.style.display !== 'none').map(p => p.getAttribute('data-tab-panel'));
    const press = (target: HTMLElement, key: string) =>
        target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

    it('the inner tabs keep their own active panel and selection, and each links inside itself', async () => {
        const { outer, inner } = await nested();
        expect(selected(inner)).toEqual(['Profile:true', 'Security:false']);
        expect(shown(inner)).toEqual(['profile']);
        for (const tab of own(inner, '[data-tab]')) {
            expect(inner.contains(document.getElementById(tab.getAttribute('aria-controls')!)), `${tab.textContent} controls a panel outside the inner tabs`).toBe(true);
        }
        // The outer switches away and back: the inner tabs are not its to change.
        (outer as HTMLElement & { select(v: string): void }).select('advanced');
        (outer as HTMLElement & { select(v: string): void }).select('general');
        expect(selected(inner)).toEqual(['Profile:true', 'Security:false']);
        expect(shown(inner)).toEqual(['profile']);
        expect(selected(outer)).toEqual(['General:true', 'Advanced:false']);
    });

    it('a click on an inner tab changes the inner tabs, not the outer', async () => {
        const { outer, inner } = await nested();
        own(inner, '[data-tab]')[1].click();
        await tick();
        expect(selected(inner)).toEqual(['Profile:false', 'Security:true']);
        // Profile's value is no outer tab's: the outer took it for its own and selected nothing.
        own(inner, '[data-tab]')[0].click();
        await tick();
        expect(selected(inner)).toEqual(['Profile:true', 'Security:false']);
        expect(selected(outer)).toEqual(['General:true', 'Advanced:false']);
        expect(shown(outer)).toEqual(['general']);
        expect((outer as HTMLElement & { value: string }).value).toBe('general');
    });

    it('arrow keys move within the tabs they are pressed in', async () => {
        const { outer, inner } = await nested();
        const [general, advanced] = own(outer, '[data-tab]');
        general.focus();
        press(general, 'ArrowRight');
        expect(document.activeElement, 'ArrowRight on the outer General reaches the outer Advanced').toBe(advanced);
        (outer as HTMLElement & { select(v: string): void }).select('general');
        const [profile, security] = own(inner, '[data-tab]');
        profile.focus();
        press(profile, 'ArrowRight');
        expect(document.activeElement, 'ArrowRight on the inner Profile reaches the inner Security').toBe(security);
        expect(selected(outer)).toEqual(['General:true', 'Advanced:false']);
    });
});
