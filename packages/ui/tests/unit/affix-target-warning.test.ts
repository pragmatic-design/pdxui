// `<pdx-affix target="…">` that matches no element says so.
//
// Measured here, not against the site's PRODUCTION build: diagnostics leave a production bundle,
// so a console there has no warning to read. Here the diagnostic is on (`DEV` is true under
// vitest) and it is measured on the component rather than through a page that happens to render
// one.
//
// The affixing behaviour, which is geometry, is measured in the site suite
// (`packages/site/tests/affix-target.spec.ts`), because happy-dom has no layout to measure.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/affix/pdx-affix';

describe('an affix target that matches nothing', () => {
    /** The spy, typed from the thing it replaces rather than from vitest's generics. */
    let warn: { mock: { calls: unknown[][] }; mockRestore(): void };

    beforeEach(() => { warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); });
    afterEach(() => { warn.mockRestore(); cleanup(); });

    const mount = async (target: string) => {
        const el = document.createElement('pdx-affix');
        el.setAttribute('target', target);
        el.textContent = 'probe';
        document.body.appendChild(el);
        await tick(40);
        return el;
    };

    const messages = (): string[] => warn.mock.calls.map((c: unknown[]) => String(c[0]));

    it('is reported, by the selector the author wrote', async () => {
        await mount('#no-such-container');
        expect(messages().filter((m: string) => m.includes('#no-such-container')),
            'an affix pinned to a selector that matches nothing sticks somewhere else and says nothing')
            .toHaveLength(1);
    });

    it('control — a target that exists is not reported', async () => {
        const box = document.createElement('div');
        box.id = 'affix-host';
        document.body.appendChild(box);

        await mount('#affix-host');
        expect(messages().filter((m: string) => m.includes('[pdx-affix]')),
            'every affix is reported, so the message says nothing about the target')
            .toEqual([]);
    });
});
