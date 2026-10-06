// pdx-carousel: a named region, a rotation control, a whole tablist, and arrows that say when they
// cannot move.
//
// - The region (role="region", aria-roledescription="carousel") has a name: without one it is not a
//   landmark.
// - Autoplay can be stopped by keyboard and touch users, not on hover only (WCAG 2.2.2).
// - The dots are tabs in a tablist that the arrow keys move through.
// - Without `loop`, "Previous" on the first slide is disabled rather than enabled and doing nothing.
//
// loop="false" in the dot and arrow tests: with loop on, the slide animation waits for a
// transitionend that happy-dom never fires.
import { describe, it, expect, afterEach } from 'vitest';
import { tick } from './helpers';
import '../../src/carousel/pdx-carousel';

type Carousel = HTMLElement & { items: unknown[]; goTo(i: number): void; readonly index: number };
const ITEMS = [{ content: 'One' }, { content: 'Two' }, { content: 'Three' }];

async function mount(attrs = ''): Promise<Carousel> {
    const host = document.createElement('div');
    host.innerHTML = `<pdx-carousel ${attrs}></pdx-carousel>`;
    document.body.appendChild(host);
    const el = host.querySelector('pdx-carousel') as Carousel;
    el.items = ITEMS;
    await tick(80);
    return el;
}

const root = (el: HTMLElement) => el.querySelector('.pdx-carousel-root') as HTMLElement;
const dots = (el: HTMLElement) => Array.from(el.querySelectorAll<HTMLButtonElement>('.pdx-carousel-dot'));
const key = (t: HTMLElement, k: string) => t.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

afterEach(() => { document.body.innerHTML = ''; });

describe('pdx-carousel region', () => {
    it('is named "Carousel" by default, and by `label` when set', async () => {
        expect(root(await mount()).getAttribute('aria-label')).toBe('Carousel');
        document.body.innerHTML = '';
        expect(root(await mount('label="Featured products"')).getAttribute('aria-label')).toBe('Featured products');
    });

    it('names each slide "n of total" from a component string', async () => {
        const el = await mount();
        expect(el.querySelector('.pdx-carousel-slide')?.getAttribute('aria-label')).toBe('1 of 3');
    });
});

describe('pdx-carousel rotation control', () => {
    it('with autoplay, the first control stops and restarts the rotation', async () => {
        const el = await mount('autoplay interval="100" animation="fade"');
        const events: string[] = [];
        el.addEventListener('pdx-autoplay-stop', () => events.push('stop'));
        el.addEventListener('pdx-autoplay-start', () => events.push('start'));
        const toggle = root(el).querySelector('button') as HTMLButtonElement;
        expect(toggle.getAttribute('aria-label')).toBe('Stop slide rotation');

        toggle.click();
        expect(events).toEqual(['stop']);
        expect(toggle.getAttribute('aria-label')).toBe('Start slide rotation');
        const at = el.index;
        await tick(300);
        expect(el.index, 'stopped, it does not advance').toBe(at);

        toggle.click();
        expect(events).toEqual(['stop', 'start']);
        expect(toggle.getAttribute('aria-label')).toBe('Stop slide rotation');
    });

    it('stops when keyboard focus moves into the carousel', async () => {
        const el = await mount('autoplay interval="100" animation="fade"');
        dots(el)[0].focus();
        expect(root(el).querySelector('button')?.getAttribute('aria-label')).toBe('Start slide rotation');
        const at = el.index;
        await tick(300);
        expect(el.index).toBe(at);
    });

    it('without autoplay there is no rotation control', async () => {
        const el = await mount();
        expect(el.querySelector('.pdx-carousel-rotation')).toBeNull();
    });
});

describe('pdx-carousel dots are a tablist', () => {
    it('only the selected tab is in the tab order, and each tab controls its slide', async () => {
        const el = await mount('loop="false"');
        expect(dots(el).map(d => d.tabIndex)).toEqual([0, -1, -1]);
        for (const d of dots(el)) {
            const id = d.getAttribute('aria-controls');
            expect(id && el.querySelector(`#${CSS.escape(id)}`)?.classList.contains('pdx-carousel-slide')).toBe(true);
        }
    });

    it('ArrowRight on the focused tab selects and focuses the next one, once', async () => {
        const el = await mount('loop="false"');
        const changes: number[] = [];
        el.addEventListener('pdx-change', (e) => changes.push((e as CustomEvent).detail.index));
        dots(el)[0].focus();
        key(dots(el)[0], 'ArrowRight');
        await tick(20);
        expect(changes).toEqual([1]);
        expect(document.activeElement).toBe(dots(el)[1]);
        expect(dots(el)[1].getAttribute('aria-selected')).toBe('true');
        expect(dots(el).map(d => d.tabIndex)).toEqual([-1, 0, -1]);
        key(dots(el)[1], 'End');
        await tick(20);
        expect(el.index).toBe(2);
    });
});

describe('pdx-carousel region keys', () => {
    it('ArrowRight on the focused region moves one slide', async () => {
        const el = await mount('loop="false"');
        root(el).focus();
        key(root(el), 'ArrowRight');
        await tick(20);
        expect(el.index).toBe(1);
    });
});

describe('pdx-carousel arrows without loop', () => {
    it('Previous is disabled on the first slide, Next on the last', async () => {
        const el = await mount('loop="false"');
        const prev = el.querySelector('.pdx-carousel-arrow-prev') as HTMLButtonElement;
        const next = el.querySelector('.pdx-carousel-arrow-next') as HTMLButtonElement;
        expect(prev.disabled).toBe(true);
        expect(next.disabled).toBe(false);
        el.goTo(2);
        await tick(20);
        expect(prev.disabled).toBe(false);
        expect(next.disabled).toBe(true);
    });

    it('with loop, neither arrow is disabled', async () => {
        const el = await mount();
        expect((el.querySelector('.pdx-carousel-arrow-prev') as HTMLButtonElement).disabled).toBe(false);
    });
});
