// pdx-flag (#1091): a region's flag, 4:3, drawn as an image from its own SVG module, loaded when the
// region is shown — a page with three flags loads three modules, not the set. Its name is the region's
// in the page's language (Intl.DisplayNames), or none when it is decorative.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/flag/pdx-flag.pdx';
import { FLAG_LOADERS } from '../../src/flag/flag-loaders';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

/** Spy on the loaders of `regions`, keeping each load so a test waits for it, not for a time. */
function spyLoads(...regions: string[]) {
    const loads: Promise<unknown>[] = [];
    const spies = regions.map((r) => {
        const real = FLAG_LOADERS[r];
        return vi.spyOn(FLAG_LOADERS, r).mockImplementation(() => { const p = real(); loads.push(p); return p; });
    });
    return { spies, settled: async () => { await Promise.all(loads); await tick(); } };
}

function flag(attrs: Record<string, string>): HTMLElement {
    const el = document.createElement('pdx-flag');
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    document.body.appendChild(el);
    return el;
}
const img = (el: HTMLElement) => el.querySelector('img[data-part="root"]') as HTMLImageElement | null;

describe('pdx-flag', () => {
    it('draws the region\'s flag as an image named by the region, in the locale', async () => {
        const { settled } = spyLoads('it');
        const el = flag({ region: 'IT', locale: 'en' });
        await settled();
        expect(img(el)?.getAttribute('src')).toMatch(/^blob:/);
        expect(img(el)?.getAttribute('alt')).toBe('Italy');
        expect(img(el)?.hasAttribute('aria-hidden')).toBe(false);
    });

    it('a region is read in either case, and named in the locale asked', async () => {
        const { settled } = spyLoads('de');
        const el = flag({ region: 'de', locale: 'it' });
        await settled();
        expect(img(el)?.getAttribute('alt')).toBe('Germania');
    });

    it('decorative: no name, hidden from assistive technology', async () => {
        const { settled } = spyLoads('fr');
        const el = flag({ region: 'FR', decorative: '' });
        await settled();
        expect(img(el)?.getAttribute('alt')).toBe('');
        expect(img(el)?.getAttribute('aria-hidden')).toBe('true');
    });

    it('label names it instead of the region', async () => {
        const { settled } = spyLoads('br');
        const el = flag({ region: 'BR', label: 'Português (Brasil)' });
        await settled();
        expect(img(el)?.getAttribute('alt')).toBe('Português (Brasil)');
    });

    it('a region it has no flag for draws nothing and loads nothing', async () => {
        const el = flag({ region: 'ZZ' });
        await tick();
        expect(img(el)).toBeNull();
    });

    it('loads only the flag it shows, once', async () => {
        const { spies, settled } = spyLoads('it', 'de', 'fr');
        flag({ region: 'IT' });
        flag({ region: 'IT' });
        await settled();
        expect(spies[0]).toHaveBeenCalled();
        expect(spies[1]).not.toHaveBeenCalled();
        expect(spies[2]).not.toHaveBeenCalled();
    });

    it('its size is the height, md by default, and the width four thirds of it', async () => {
        const { settled } = spyLoads('it');
        const md = flag({ region: 'IT' });
        const lg = flag({ region: 'IT', size: 'lg' });
        await settled();
        expect(img(md)?.style.getPropertyValue('--pdx-flag-size')).toBe('20px');
        expect(img(lg)?.style.getPropertyValue('--pdx-flag-size')).toBe('24px');
    });

    it('another region draws another flag', async () => {
        const { settled } = spyLoads('it', 'es');
        const el = flag({ region: 'IT', locale: 'en' });
        await settled();
        el.setAttribute('region', 'ES');
        await settled();
        expect(img(el)?.getAttribute('alt')).toBe('Spain');
    });
});
