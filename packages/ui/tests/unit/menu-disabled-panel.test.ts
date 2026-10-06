// Toggling `disabled` must NOT permanently destroy the floating panel.
// A panel teardown in a track that reads ctx.disabled() removes the panel and nulls it on every
// disabled change — and the build track (guarded by `if(!_built)`) never rebuilds it, leaving the
// menu dead forever. Teardown runs only on destroy.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/dropdown-menu/pdx-dropdown-menu';
import '../../src/context-menu/pdx-context-menu';
import '../../src/split-button/pdx-split-button';

const items = [{ label: 'Edit', onClick() {} }, { label: 'Delete', onClick() {} }];

async function mount(tag: string, extra: (el: HTMLElement) => void = () => {}): Promise<HTMLElement> {
    const el = document.createElement(tag);
    (el as any).items = items;
    extra(el);
    document.body.appendChild(el);
    await tick(50);
    return el;
}

describe('disabled toggle keeps the menu panel alive', () => {
    beforeEach(cleanup);

    it('dropdown-menu still opens after disabled true→false', async () => {
        const el = await mount('pdx-dropdown-menu', (e) => e.setAttribute('label', 'Menu'));

        (el as any).disabled = true;
        await tick(50);
        (el as any).disabled = false;
        await tick(50);

        (el as any).open();
        await tick();

        const trigger = el.querySelector('button');
        expect(trigger?.getAttribute('aria-expanded')).toBe('true');
        const panel = document.querySelector('.pdx-dropdown-menu-panel') as HTMLElement | null;
        expect(panel).toBeTruthy();
        expect(panel!.style.display).not.toBe('none');
        expect(panel!.querySelectorAll('.pdx-menu-item').length).toBeGreaterThan(0);
    });

    it('context-menu still opens after disabled true→false', async () => {
        const el = await mount('pdx-context-menu');

        (el as any).disabled = true;
        await tick(50);
        (el as any).disabled = false;
        await tick(50);

        (el as any).open(20, 20);
        await tick();

        const panel = document.querySelector('.pdx-context-menu-panel') as HTMLElement | null;
        expect(panel).toBeTruthy();
        expect(panel!.style.display).not.toBe('none');
    });

    it('split-button still opens after disabled true→false', async () => {
        const el = await mount('pdx-split-button', (e) => e.setAttribute('label', 'Save'));

        (el as any).disabled = true;
        await tick(50);
        (el as any).disabled = false;
        await tick(50);

        const arrow = el.querySelector('.pdx-split-arrow') as HTMLButtonElement;
        expect(arrow).toBeTruthy();
        arrow.click();
        await tick();

        const panel = document.querySelector('.pdx-split-button-panel') as HTMLElement | null;
        expect(panel).toBeTruthy();
        expect(panel!.style.display).not.toBe('none');
    });
});
