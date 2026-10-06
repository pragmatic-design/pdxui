// <pdx-fieldset disabled> disables what it contains.
//
// The prop reaches the inner <fieldset> as `disabled`; without it, the "Disabled Section" demo's
// input would take typing. The native attribute is the whole mechanism — a
// disabled fieldset disables every form control inside it, except those in its first legend.
//
// happy-dom does not implement that inheritance (`input:disabled` stays false under a disabled
// fieldset), so this file asserts the attribute; the controls' `:disabled` is measured in Chromium
// by fieldset.manifest.ts (scenario fieldset-disabled) and site/fieldset-disabled.spec.ts.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/fieldset/pdx-fieldset';

async function mount(html: string): Promise<HTMLElement> {
    document.body.innerHTML = html;
    await tick(20);
    return document.body.querySelector('pdx-fieldset') as HTMLElement;
}

const inner = (el: Element) => el.querySelector('fieldset') as HTMLFieldSetElement;

beforeEach(cleanup);

describe('pdx-fieldset disabled', () => {
    it('sets disabled on the native fieldset', async () => {
        const el = await mount('<pdx-fieldset legend="Account" disabled><input name="email"></pdx-fieldset>');
        expect(inner(el).disabled).toBe(true);
        expect(inner(el).hasAttribute('disabled')).toBe(true);
    });

    it('follows the attribute both ways', async () => {
        const el = await mount('<pdx-fieldset legend="Account" disabled><input name="email"></pdx-fieldset>');
        el.removeAttribute('disabled');
        await tick();
        expect(inner(el).hasAttribute('disabled')).toBe(false);
        el.setAttribute('disabled', '');
        await tick();
        expect(inner(el).hasAttribute('disabled')).toBe(true);
    });

    it('follows the property both ways', async () => {
        const el = await mount('<pdx-fieldset legend="Account"><input name="email"></pdx-fieldset>');
        const host = el as unknown as { disabled: boolean };
        host.disabled = true;
        await tick();
        expect(inner(el).hasAttribute('disabled')).toBe(true);
        host.disabled = false;
        await tick();
        expect(inner(el).hasAttribute('disabled')).toBe(false);
    });

    it('an enabled fieldset is not disabled', async () => {
        const el = await mount('<pdx-fieldset legend="Account"><input name="email"></pdx-fieldset>');
        expect(inner(el).hasAttribute('disabled')).toBe(false);
    });
});
