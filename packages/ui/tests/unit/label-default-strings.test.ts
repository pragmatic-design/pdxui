// Accessible names and button texts come from component strings, not English prop defaults or
// `|| 'English'` fallbacks.
//
// Text in a prop's default or in a literal fallback is out of every component string's reach: an
// Italian app that sets no label would hear «More actions», «Scrollable content», «Choose date». The
// literal-string guard sees neither shape. Each case below: with the component string
// overridden and no prop, the component says the override; with the prop set, the prop wins.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { setComponentStrings, clearComponentStrings } from '@pdxui/core';
import '../../src/shared/i18n';
import '../../src/split-button/pdx-split-button';
import '../../src/scroll-area/pdx-scroll-area';
import '../../src/progress/pdx-progress';
import '../../src/rating/pdx-rating';
import '../../src/fab/pdx-fab';
import '../../src/file-upload/pdx-file-upload';
import '../../src/date-picker/pdx-date-picker';
import '../../src/time-picker/pdx-time-picker';
import '../../src/alert-dialog/pdx-alert-dialog';
import '../../src/auto-form/pdx-auto-form';
import '../../src/edit-drawer/pdx-edit-drawer';
import '../../src/entity-grid/pdx-entity-grid';
import '../../src/relation-picker/pdx-relation-picker';
import '../../src/select/pdx-select';
import '../../src/timeline/pdx-timeline';
import '../../src/bottom-sheet/pdx-bottom-sheet';
import '../../src/color-picker/pdx-color-picker';
import '../../src/command/pdx-command';
import '../../src/dialog/pdx-dialog';
import '../../src/drawer/pdx-drawer';
import '../../src/popover/pdx-popover';
import '../../src/slider/pdx-slider';
import '../../src/tag-input/pdx-tag-input';

interface Case {
    /** component string: [component, key] */
    string: [string, string];
    /** the element with no label prop */
    html: string;
    /** the attribute that sets the prop */
    prop: string;
    /** where the name or text is read */
    target: string;
    read: 'name' | 'text';
    /** JS properties a component needs before it renders the part under test */
    setup?: (el: HTMLElement) => void;
}

const OVERRIDE = 'Dal registro';
const PROP = 'Dal prop';

const CASES: Record<string, Case> = {
    'split-button menu': { string: ['split-button', 'menu'], html: `<pdx-split-button label="Save" items='[{"key":"a","label":"A"}]'></pdx-split-button>`, prop: 'menu-label', target: '.pdx-split-arrow', read: 'name' },
    // No 'scroll-area region': without a label a scroll area is not a region and takes no default
    // name — a default would make four identical "Scrollable content" landmarks on one page. The
    // label-only contract is in batch4-a11y.test.ts.
    'progress bar': { string: ['progress', 'label'], html: '<pdx-progress value="30"></pdx-progress>', prop: 'aria-label', target: '[role="progressbar"]', read: 'name' },
    'rating slider': { string: ['rating', 'label'], html: '<pdx-rating></pdx-rating>', prop: 'label', target: '[role="slider"]', read: 'name' },
    'fab button': { string: ['fab', 'label'], html: '<pdx-fab></pdx-fab>', prop: 'label', target: 'button.pdx-fab', read: 'name' },
    'file-upload dropzone name': { string: ['file-upload', 'drop'], html: '<pdx-file-upload></pdx-file-upload>', prop: 'label', target: 'div[role="button"]', read: 'name' },
    'file-upload dropzone text': { string: ['file-upload', 'drop'], html: '<pdx-file-upload></pdx-file-upload>', prop: 'label', target: '.pdx-file-dropzone-label', read: 'text' },
    'date-picker trigger': { string: ['date-picker', 'choose'], html: '<pdx-date-picker></pdx-date-picker>', prop: 'aria-label', target: '.pdx-date-picker-trigger', read: 'name' },
    'time-picker group': { string: ['time-picker', 'label'], html: '<pdx-time-picker></pdx-time-picker>', prop: 'aria-label', target: '.pdx-time-picker[role="group"]', read: 'name' },
    'alert-dialog confirm': { string: ['alert-dialog', 'confirm'], html: '<pdx-alert-dialog></pdx-alert-dialog>', prop: 'confirm-label', target: '.pdx-alert-confirm', read: 'text' },
    'alert-dialog cancel': { string: ['alert-dialog', 'cancel'], html: '<pdx-alert-dialog></pdx-alert-dialog>', prop: 'cancel-label', target: '.pdx-alert-cancel', read: 'text' },
    'auto-form submit': {
        string: ['auto-form', 'submit'], html: '<pdx-auto-form></pdx-auto-form>', prop: 'submit-label',
        target: 'pdx-button[variant="primary"]', read: 'text',
        setup: (el) => { (el as unknown as { fields: unknown }).fields = [{ name: 'n', label: 'N', type: 'text' }]; },
    },
    'auto-form reset': {
        string: ['auto-form', 'reset'], html: '<pdx-auto-form></pdx-auto-form>', prop: 'reset-label',
        target: 'pdx-button[variant="ghost"]', read: 'text',
        setup: (el) => { (el as unknown as { fields: unknown }).fields = [{ name: 'n', label: 'N', type: 'text' }]; },
    },
    'edit-drawer save': { string: ['edit-drawer', 'save'], html: '<pdx-edit-drawer></pdx-edit-drawer>', prop: 'save-label', target: 'button.pdx-primary', read: 'text' },
    'edit-drawer cancel': { string: ['edit-drawer', 'cancel'], html: '<pdx-edit-drawer></pdx-edit-drawer>', prop: 'cancel-label', target: 'button.pdx-ghost', read: 'text' },
    'entity-grid add': {
        string: ['entity-grid', 'add'], html: '<pdx-entity-grid></pdx-entity-grid>', prop: 'add-label',
        target: '.pdx-entity-grid-toolbar button.pdx-primary', read: 'text',
        setup: (el) => { (el as unknown as { schema: unknown }).schema = { fields: [] }; },
    },
    'relation-picker add': {
        string: ['relation-picker', 'add'], html: '<pdx-relation-picker></pdx-relation-picker>', prop: 'add-label',
        target: '.pdx-relation-picker-foot pdx-button[variant="primary"]', read: 'text',
        setup: (el) => { Object.assign(el, { columns: [{ field: 'name' }], source: [] }); },
    },
    'timeline pending': { string: ['timeline', 'pending'], html: '<pdx-timeline pending></pdx-timeline>', prop: 'pending-label', target: '.pdx-tl-title.pdx-ink-muted', read: 'text' },
    'bottom-sheet dialog': { string: ['bottom-sheet', 'label'], html: '<pdx-bottom-sheet></pdx-bottom-sheet>', prop: 'label', target: '.pdx-bottom-sheet[role="dialog"]', read: 'name' },
    'color-picker swatch': { string: ['color-picker', 'pick'], html: '<pdx-color-picker></pdx-color-picker>', prop: 'label', target: '.pdx-color-swatch', read: 'name' },
    'command search': { string: ['command', 'search'], html: '<pdx-command placeholder=""></pdx-command>', prop: 'placeholder', target: '[role="combobox"]', read: 'name' },
    'dialog panel': { string: ['dialog', 'label'], html: '<pdx-dialog></pdx-dialog>', prop: 'title', target: '.pdx-dialog-panel', read: 'name' },
    'drawer panel': { string: ['drawer', 'label'], html: '<pdx-drawer></pdx-drawer>', prop: 'label', target: '.pdx-drawer[role="dialog"]', read: 'name' },
    'popover float': { string: ['popover', 'label'], html: '<pdx-popover></pdx-popover>', prop: 'aria-label', target: '.pdx-popover-float', read: 'name' },
    'select listbox': { string: ['select', 'listbox'], html: '<pdx-select></pdx-select>', prop: 'label', target: '[role="listbox"]', read: 'name' },
    'slider thumb': { string: ['slider', 'value'], html: '<pdx-slider></pdx-slider>', prop: 'aria-label', target: '.pdx-slider-thumb', read: 'name' },
    'tag-input group': { string: ['tag-input', 'label'], html: '<pdx-tag-input></pdx-tag-input>', prop: 'label', target: '[role="group"]', read: 'name' },
    'tag-input field': { string: ['tag-input', 'add'], html: '<pdx-tag-input></pdx-tag-input>', prop: 'label', target: 'input', read: 'name' },
};

function withAttr(html: string, attr: string, value: string): string {
    return html.replace(/^<([\w-]+)/, `<$1 ${attr}="${value}"`);
}

async function readOf(c: Case, html: string): Promise<string> {
    document.body.innerHTML = html;
    const host = document.body.firstElementChild as HTMLElement;
    c.setup?.(host);
    let value = '';
    await vi.waitFor(() => {
        const el = host.querySelector<HTMLElement>(c.target);
        expect(el, `${c.target} was not rendered`).toBeTruthy();
        value = c.read === 'name' ? el!.getAttribute('aria-label') ?? '' : el!.textContent!.trim();
        expect(value, 'still empty').not.toBe('');
    }, { timeout: 2000 });
    return value;
}

afterEach(() => {
    document.body.innerHTML = '';
    clearComponentStrings();
});

describe('a label prop that is not set falls back to a component string', () => {
    for (const [name, c] of Object.entries(CASES)) {
        it(`${name}: with no prop it is ${c.string.join('.')}`, async () => {
            setComponentStrings(c.string[0], { [c.string[1]]: OVERRIDE });
            expect(await readOf(c, c.html)).toBe(OVERRIDE);
        });

        it(`${name}: the control — the prop, when set, wins`, async () => {
            setComponentStrings(c.string[0], { [c.string[1]]: OVERRIDE });
            expect(await readOf(c, withAttr(c.html, c.prop, PROP))).toBe(PROP);
        });
    }
});

describe('pdx-select creatable', () => {
    async function createText(attrs = ''): Promise<string> {
        document.body.innerHTML = `<pdx-select creatable searchable ${attrs}></pdx-select>`;
        const el = document.body.firstElementChild as HTMLElement & { options: string[] };
        el.options = ['Rossi'];
        let text = '';
        await vi.waitFor(() => {
            const search = el.querySelector<HTMLInputElement>('input.pdx-select-search');
            expect(search).toBeTruthy();
            if (search!.value !== 'Verdi') {
                search!.value = 'Verdi';
                search!.dispatchEvent(new Event('input', { bubbles: true }));
            }
            text = el.querySelector('.pdx-select-create')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
            expect(text).not.toBe('');
        }, { timeout: 2000 });
        return text;
    }

    it('with no create-label, the option reads select.create', async () => {
        setComponentStrings('select', { create: 'Crea «{query}»' });
        expect(await createText()).toBe('+ Crea «Verdi»');
    });

    it('the control: create-label, when set, wins', async () => {
        setComponentStrings('select', { create: 'Crea «{query}»' });
        expect(await createText('create-label="Aggiungi {query}"')).toBe('+ Aggiungi Verdi');
    });
});
