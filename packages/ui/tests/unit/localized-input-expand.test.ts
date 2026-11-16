// pdx-localized-input `expandable` (#1091): a button in the field's suffix, "All languages", opens a
// dialog with every culture as a labelled field (the stacked layout, flags when `flags`), each with its
// `lang` and `dir`, the missing ones marked. An edit there is the value's at once: the model is one.

import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, tick, whenUpgraded } from './helpers';
import '../../src/localized-input/pdx-localized-input.pdx';

afterEach(() => cleanup());

interface LocalizedInput extends HTMLElement {
    value: Record<string, string> | null;
    cultures: string[];
    regions: Record<string, string>;
}
interface Dialog extends HTMLElement { open: boolean; close(): void }

async function field(props: Partial<LocalizedInput>, attrs: Record<string, string> = {}): Promise<LocalizedInput> {
    const el = document.createElement('pdx-localized-input') as LocalizedInput;
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    Object.assign(el, props);
    document.body.appendChild(el);
    await tick();
    return el;
}

const button = (el: Element) => el.querySelector<HTMLButtonElement>('[data-part="panel"]:not([hidden]) [data-part="expandButton"]');
const dialogOf = (el: Element) => el.querySelector<Dialog>('pdx-dialog');
/** The fields inside the dialog: the nested stacked field's inputs. */
const dialogFields = (el: Element) => [...(dialogOf(el)?.querySelectorAll<HTMLInputElement>('[data-part="field"]') ?? [])];

async function openDialog(el: LocalizedInput): Promise<Dialog> {
    button(el)!.click();
    await tick();
    const dialog = dialogOf(el)!;
    await whenUpgraded(dialog);
    await whenUpgraded(dialog.querySelector('pdx-localized-input'));
    return dialog;
}

describe('pdx-localized-input, expandable', () => {
    it('has no button and no dialog unless expandable', async () => {
        const el = await field({ cultures: ['en', 'it'] });
        expect(el.querySelector('[data-part="expandButton"]')).toBeNull();
        expect(dialogOf(el)).toBeNull();
    });

    it('puts an "All languages" button in the field\'s suffix, a dialog opener', async () => {
        const el = await field({ cultures: ['en', 'it'] }, { expandable: '' });
        const b = button(el);
        expect(b).not.toBeNull();
        expect(b!.getAttribute('aria-label')).toBe('All languages');
        expect(b!.getAttribute('aria-haspopup')).toBe('dialog');
        // In the suffix: after the culture's field, in its panel.
        expect(b!.previousElementSibling?.getAttribute('data-part')).toBe('field');
    });

    it('the flag layout has it too; the stacked layout, which shows every culture, does not', async () => {
        const flag = await field({ cultures: ['en', 'it'] }, { expandable: '', layout: 'flag' });
        expect(button(flag)).not.toBeNull();
        const stacked = await field({ cultures: ['en', 'it'] }, { expandable: '', layout: 'stacked' });
        expect(stacked.querySelector('[data-part="expandButton"]')).toBeNull();
    });

    it('opens a dialog with every culture as a labelled field, its lang and dir, the missing marked', async () => {
        const el = await field({ cultures: ['en', 'it', 'ar'], value: { en: 'Desk lamp' } }, { expandable: '', label: 'Product name' });
        const dialog = await openDialog(el);
        expect(dialog.open).toBe(true);
        expect(dialog.getAttribute('title') ?? (dialog as unknown as { title: string }).title).toBe('Product name');
        const fields = dialogFields(el);
        expect(fields.map((f) => f.getAttribute('lang'))).toEqual(['en', 'it', 'ar']);
        expect(fields.map((f) => f.getAttribute('dir'))).toEqual(['ltr', 'ltr', 'rtl']);
        expect(fields.map((f) => f.getAttribute('aria-label'))).toEqual(['Product name (English)', 'Product name (italiano)', 'Product name (العربية)']);
        expect(fields[0].value).toBe('Desk lamp');
        // The missing cultures carry their marker in the row label.
        const rows = [...dialog.querySelectorAll('.pdx-localized-row-label')];
        expect(rows.map((r) => !!r.querySelector('.pdx-localized-marker'))).toEqual([false, true, true]);
    });

    it('an edit in the dialog is the value at once, and the field shows it', async () => {
        const el = await field({ cultures: ['en', 'it'], value: { en: 'Desk lamp' } }, { expandable: '' });
        await openDialog(el);
        const it = dialogFields(el)[1];
        it.value = 'Lampada';
        it.dispatchEvent(new Event('input', { bubbles: true }));
        await tick();
        expect(el.value).toEqual({ en: 'Desk lamp', it: 'Lampada' });
        const outer = [...el.querySelectorAll<HTMLInputElement>(':scope [data-part="panel"] > [data-part="field"]')].find((f) => f.getAttribute('lang') === 'it' && !f.closest('pdx-dialog'));
        expect(outer?.value).toBe('Lampada');
    });

    it('shows the flags in the dialog when the field has them', async () => {
        const el = await field({ cultures: ['en', 'it-IT'], regions: { en: 'GB' } }, { expandable: '', flags: '' });
        const dialog = await openDialog(el);
        const regions = [...dialog.querySelectorAll('.pdx-localized-row-label pdx-flag')].map((f) => (f as HTMLElement & { region: string }).region);
        expect(regions).toEqual(['GB', 'IT']);
    });

    it('closes, and opens again', async () => {
        const el = await field({ cultures: ['en', 'it'] }, { expandable: '' });
        const dialog = await openDialog(el);
        dialog.close();
        await tick();
        expect(dialog.open).toBe(false);
        await openDialog(el);
        expect(dialogOf(el)!.open).toBe(true);
    });
});
