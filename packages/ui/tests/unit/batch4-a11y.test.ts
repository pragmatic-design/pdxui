// Small accessibility and behaviour rules, batch 4. One test per item, each measured in Chromium on
// its site page.
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/search-input/pdx-search-input';
import '../../src/password-input/pdx-password-input';
import '../../src/tag-input/pdx-tag-input';
import '../../src/time-picker/pdx-time-picker';
import '../../src/tabs/pdx-tabs';
import '../../src/wizard/pdx-wizard';
import '../../src/timeline/pdx-timeline';
import '../../src/slider/pdx-slider';
import '../../src/label/pdx-label';
import '../../src/form-field/pdx-form-field';
import '../../src/scroll-area/pdx-scroll-area';
import '../../src/statistic/pdx-statistic';
import '../../src/splitter/pdx-splitter';
import '../../src/relative-time/pdx-relative-time';

beforeEach(cleanup);

async function render(markup: string): Promise<HTMLElement> {
    document.body.innerHTML = markup;
    await tick(30);
    await tick(30);
    return document.body.firstElementChild as HTMLElement;
}

function key(target: Element, k: string): void {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
}

function type(input: HTMLInputElement, value: string): void {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Text of the elements an aria-describedby / aria-labelledby names. */
function referenced(el: Element, attr: string): string {
    return (el.getAttribute(attr) ?? '').split(/\s+/).filter(Boolean)
        .map(id => document.getElementById(id)?.textContent?.trim() ?? '').join(' ').trim();
}

describe('input family', () => {
    it('search: one pdx-search for one search, when Enter follows the debounce', async () => {
        const host = await render('<pdx-search-input debounce="20"></pdx-search-input>');
        const seen: string[] = [];
        host.addEventListener('pdx-search', (e) => seen.push((e as CustomEvent).detail.value));
        const input = host.querySelector('input')!;
        type(input, 'widgets');
        await tick(60);                       // the debounce fires
        key(input, 'Enter');                  // and Enter asks for the same search
        await tick(20);
        expect(seen).toEqual(['widgets']);
    });

    it('password: the strength is described and announced, and "abc" is Weak', async () => {
        const host = await render('<pdx-password-input show-strength aria-label="Password"></pdx-password-input>');
        const input = host.querySelector('input')!;
        type(input, 'abc');
        await tick(20);
        expect(referenced(input, 'aria-describedby')).toContain('Weak');
        const live = document.getElementById(input.getAttribute('aria-describedby')!)!;
        expect(live.getAttribute('aria-live')).toBe('polite');
        type(input, 'Abcdefgh1!');
        await tick(20);
        expect(document.getElementById(input.getAttribute('aria-describedby')!), 'the live region was replaced, not updated').toBe(live);
        expect(live.textContent).not.toContain('Weak');
    });

    it('tag-input: Backspace in the empty field removes the last tag, and says so', async () => {
        const host = await render(`<pdx-tag-input value='["alpha","beta"]' label="Tags"></pdx-tag-input>`);
        const input = host.querySelector<HTMLInputElement>('.pdx-tag-input-field')!;
        input.focus();
        key(input, 'Backspace');
        await tick(20);
        expect((host as unknown as { value: string[] }).value).toEqual(['alpha']);
        expect(host.querySelector('[role="status"]')?.textContent).toContain('beta');
    });

    it('time-picker: ↑ on an empty hour sets an hour (from min, one step on)', async () => {
        const host = await render('<pdx-time-picker min="09:00"></pdx-time-picker>');
        const hour = host.querySelector<HTMLElement>('[role="spinbutton"]')!;
        expect(hour.textContent).toBe('--');
        key(hour, 'ArrowUp');
        await tick(20);
        expect((host as unknown as { value: string }).value).toBe('10:00');
        expect(hour.getAttribute('aria-valuenow')).toBe('10');
    });
});

describe('navigation and structure', () => {
    it('tabs: the tablist is named, and a panel with nothing focusable is a tab stop', async () => {
        const host = await render(`<pdx-tabs label="Settings">
            <div role="tablist"><button data-tab="a">General</button><button data-tab="b">Account</button></div>
            <div data-tab-panel="a">Only text here.</div>
            <div data-tab-panel="b"><button>Save</button></div>
        </pdx-tabs>`);
        expect(host.querySelector('[role="tablist"]')?.getAttribute('aria-label')).toBe('Settings');
        expect(host.querySelector('[data-tab-panel="a"]')?.getAttribute('tabindex')).toBe('0');
        (host as unknown as { select(v: string): void }).select('b');
        await tick(20);
        expect(host.querySelector('[data-tab-panel="b"]')?.hasAttribute('tabindex'), 'a panel that starts with a control needs no stop').toBe(false);
    });

    it('wizard: the current step is aria-current="step", and a move is announced', async () => {
        const host = await render(`<pdx-wizard>
            <div data-wizard-step data-label="Account">A</div>
            <div data-wizard-step data-label="Profile">B</div>
            <div data-wizard-step data-label="Done">C</div>
        </pdx-wizard>`);
        const steps = [...host.querySelectorAll('[data-step-btn]')];
        expect(steps[0].getAttribute('aria-current')).toBe('step');
        expect(steps[1].hasAttribute('aria-current')).toBe(false);
        host.querySelector<HTMLButtonElement>('[data-wizard-next]')!.click();
        await tick(20);
        expect(steps[1].getAttribute('aria-current')).toBe('step');
        expect(host.querySelector('[role="status"]')?.textContent?.trim()).toBe('Step 2 of 3: Profile');
    });

    it('timeline: an ordered list, whose items say their status', async () => {
        const host = await render('<pdx-timeline></pdx-timeline>');
        (host as unknown as { items: unknown[] }).items = [
            { title: 'Ordered', status: 'success', statusLabel: 'Completed' },
            { title: 'Shipped', status: 'info' },
            { title: 'Delivered' },
        ];
        await tick(30);
        const list = host.querySelector('ol');
        expect(list, 'the timeline is not an <ol>').toBeTruthy();
        const items = [...list!.querySelectorAll(':scope > li')];
        expect(items).toHaveLength(3);
        expect(items[0].querySelector('.pdx-sr-only')?.textContent).toBe('Completed');
        expect(items[1].querySelector('.pdx-sr-only')?.textContent).toBe('info');
        expect(items[2].querySelector('.pdx-sr-only'), 'no status, nothing to say').toBeNull();
    });
});

describe('names', () => {
    it('slider: named by its label prop, or by the pdx-label before it', async () => {
        const host = await render('<pdx-slider label="Volume"></pdx-slider>');
        expect(host.querySelector('[role="slider"]')?.getAttribute('aria-label')).toBe('Volume');
        await render('<div><pdx-label text="Brightness"></pdx-label><pdx-slider></pdx-slider></div>');
        const thumb = document.querySelector('[role="slider"]')!;
        expect(referenced(thumb, 'aria-labelledby')).toBe('Brightness');
    });

    it('slider: inside a pdx-form-field, named by its label; a range keeps minimum and maximum apart', async () => {
        await render('<div><pdx-form-field label="Volume"><pdx-slider value="40"></pdx-slider></pdx-form-field>'
            + '<pdx-form-field label="Price range"><pdx-slider value="20,80" range></pdx-slider></pdx-form-field></div>');
        await tick(30);
        const thumbs = [...document.querySelectorAll('[role="slider"]')];
        expect(referenced(thumbs[0], 'aria-labelledby')).toBe('Volume');
        expect(referenced(thumbs[1], 'aria-labelledby')).toMatch(/^Price range/);
        // The thumb's own part of the name is its aria-label, which aria-labelledby includes by id.
        expect(thumbs[1].getAttribute('aria-labelledby')?.split(' ')).toContain(thumbs[1].id);
        expect(thumbs[2].getAttribute('aria-labelledby')?.split(' ')).toContain(thumbs[2].id);
    });

    it('slider: range thumbs are "{label}, minimum" and "{label}, maximum"', async () => {
        const host = await render('<pdx-slider range label="Price"></pdx-slider>');
        const names = [...host.querySelectorAll('[role="slider"]')].map(t => t.getAttribute('aria-label'));
        expect(names).toEqual(['Price, minimum', 'Price, maximum']);
    });

    it('scroll-area: no unnamed region; a label makes it one', async () => {
        const plain = await render('<pdx-scroll-area><p>Long text</p></pdx-scroll-area>');
        const vp = plain.querySelector('.pdx-scroll-area-viewport')!;
        expect(vp.getAttribute('role')).toBeNull();
        expect(vp.getAttribute('tabindex'), 'still reachable to scroll with the keyboard').toBe('0');
        const named = await render('<pdx-scroll-area label="Release notes"><p>Long text</p></pdx-scroll-area>');
        const nvp = named.querySelector('.pdx-scroll-area-viewport')!;
        expect(nvp.getAttribute('role')).toBe('region');
        expect(nvp.getAttribute('aria-label')).toBe('Release notes');
    });

    it('statistic: the trend icon is aria-hidden', async () => {
        const host = await render('<pdx-statistic label="Revenue" value="1284" trend="up" trend-value="+12.5%"></pdx-statistic>');
        const icon = host.querySelector('.pdx-statistic-trend pdx-icon')!;
        expect(icon.getAttribute('aria-hidden')).toBe('true');
    });

    it('splitter: the separator controls the pane it resizes', async () => {
        const host = await render('<pdx-splitter><div>Left</div><div>Right</div></pdx-splitter>');
        const sep = host.querySelector('[role="separator"]')!;
        const controlled = document.getElementById(sep.getAttribute('aria-controls') ?? '');
        expect(controlled?.textContent).toBe('Left');
    });

    it('relative-time: +24 h is "tomorrow", as −24 h is "yesterday"', async () => {
        const day = 86_400_000;
        const ahead = await render(`<pdx-relative-time locale="en" datetime="${new Date(Date.now() + day).toISOString()}"></pdx-relative-time>`);
        expect(ahead.textContent?.trim()).toBe('tomorrow');
        const behind = await render(`<pdx-relative-time locale="en" datetime="${new Date(Date.now() - day).toISOString()}"></pdx-relative-time>`);
        expect(behind.textContent?.trim()).toBe('yesterday');
        const hours = await render(`<pdx-relative-time locale="en" datetime="${new Date(Date.now() + 3 * 3_600_000).toISOString()}"></pdx-relative-time>`);
        expect(hours.textContent?.trim()).toBe('in 3 hours');
    });
});
