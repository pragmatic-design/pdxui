// Visible English reaches the component strings in every shape it takes: titles, placeholders and
// messages as prop defaults, `|| 'Text'` fallbacks into text, ternaries, and prose between the tags of
// a template.
//
// These are what an Italian app would SEE when it sets nothing: «Are you sure?», «Type a command...»,
// «No results found.», the confirm service's «Confirm» and «Cancel». The literal-string guard has a
// pattern for each shape.
// Every case: with the component string overridden and no prop, the override shows; with the prop
// set, the prop wins.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { setComponentStrings, clearComponentStrings } from '@pdxui/core';
import '../../src/shared/i18n';
import '../../src/data-grid/grid-i18n';
import { dialog } from '../../src/dialog/dialog-service';
import '../../src/overlay/pdx-overlay-outlet';
import '../../src/alert-dialog/pdx-alert-dialog';
import '../../src/command/pdx-command';
import '../../src/empty-state/pdx-empty-state';
import '../../src/list/pdx-list';
import '../../src/search-input/pdx-search-input';
import '../../src/edit-drawer/pdx-edit-drawer';
import '../../src/field-group/pdx-field-group';
import '../../src/data-grid/pdx-data-grid';
import '../../src/infinite-scroll/pdx-infinite-scroll';
import '../../src/password-input/pdx-password-input';
import '../../src/badge/pdx-badge';
import '../../src/select/pdx-select';
import '../../src/tag-input/pdx-tag-input';
import '../../src/file-upload/pdx-file-upload';
import '../../src/inline-edit/pdx-inline-edit';
import '../../src/field-list/pdx-field-list';

interface Case {
    string: [string, string];
    html: string;
    prop: string;
    target: string;
    read: 'text' | 'name' | 'placeholder';
    setup?: (el: HTMLElement) => void;
}

const OVERRIDE = 'Dal registro';
const PROP = 'Dal prop';

const CASES: Record<string, Case> = {
    'alert-dialog title': { string: ['alert-dialog', 'title'], html: '<pdx-alert-dialog></pdx-alert-dialog>', prop: 'title', target: '.pdx-dialog-header span', read: 'text' },
    'alert-dialog name': { string: ['alert-dialog', 'title'], html: '<pdx-alert-dialog></pdx-alert-dialog>', prop: 'title', target: '[role="alertdialog"]', read: 'name' },
    'command placeholder': { string: ['command', 'placeholder'], html: '<pdx-command></pdx-command>', prop: 'placeholder', target: '[role="combobox"]', read: 'placeholder' },
    'command empty list': { string: ['command', 'empty'], html: '<pdx-command></pdx-command>', prop: 'empty-text', target: '.pdx-command-empty', read: 'text' },
    'empty-state title': { string: ['empty-state', 'title'], html: '<pdx-empty-state></pdx-empty-state>', prop: 'title', target: '.pdx-empty-state-title', read: 'text' },
    'list empty title': { string: ['list', 'empty'], html: '<pdx-list></pdx-list>', prop: 'empty-title', target: '.pdx-empty-state-title', read: 'text' },
    'search-input placeholder': { string: ['search-input', 'placeholder'], html: '<pdx-search-input></pdx-search-input>', prop: 'placeholder', target: 'input', read: 'placeholder' },
    'edit-drawer title (new)': { string: ['edit-drawer', 'new'], html: '<pdx-edit-drawer></pdx-edit-drawer>', prop: 'title', target: 'header.pdx-txt-heading', read: 'text' },
    'field-group trigger': { string: ['field-group', 'edit'], html: '<pdx-field-group display="dialog"></pdx-field-group>', prop: 'label', target: '.pdx-field-group-trigger', read: 'text' },
    'data-grid empty': {
        string: ['data-grid', 'empty.title'], html: '<pdx-data-grid></pdx-data-grid>', prop: 'empty-title', target: '.pdx-dg-empty-text', read: 'text',
        setup: (el) => { Object.assign(el, { columns: [{ field: 'name', header: 'Name' }], data: [] }); },
    },
    'infinite-scroll end': { string: ['infinite-scroll', 'end'], html: '<pdx-infinite-scroll></pdx-infinite-scroll>', prop: 'end-message', target: '.pdx-infinite-scroll-end', read: 'text' },
    'infinite-scroll loading': { string: ['infinite-scroll', 'loading'], html: '<pdx-infinite-scroll></pdx-infinite-scroll>', prop: 'loading-message', target: '.pdx-infinite-scroll-text', read: 'text' },
    // The key is read, not shadowed by a literal '+ Add' as the prop's default.
    'field-list add': { string: ['field-list', 'add'], html: '<pdx-field-list></pdx-field-list>', prop: 'add-label', target: '.pdx-field-list-header button', read: 'text' },
};

function withAttr(html: string, attr: string, value: string): string {
    return html.replace(/^<([\w-]+)/, `<$1 ${attr}="${value}"`);
}

function readPart(el: HTMLElement, read: Case['read']): string {
    if (read === 'name') return el.getAttribute('aria-label') ?? '';
    if (read === 'placeholder') return (el as HTMLInputElement).placeholder ?? '';
    return el.textContent!.trim();
}

async function readOf(c: Case, html: string): Promise<string> {
    document.body.innerHTML = html;
    const host = document.body.firstElementChild as HTMLElement;
    c.setup?.(host);
    let value = '';
    await vi.waitFor(() => {
        const el = host.querySelector<HTMLElement>(c.target);
        expect(el, `${c.target} was not rendered`).toBeTruthy();
        value = readPart(el!, c.read);
        expect(value, 'still empty').not.toBe('');
    }, { timeout: 2000 });
    return value;
}

async function rendered<T extends Element>(find: () => T | null): Promise<T> {
    let found: T | null = null;
    await vi.waitFor(() => { found = find(); expect(found).toBeTruthy(); }, { timeout: 2000 });
    return found!;
}

afterEach(() => {
    dialog.closeAll();
    document.body.innerHTML = '';
    clearComponentStrings();
});

describe('a visible text whose prop is not set comes from a component string', () => {
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

describe('the confirm service reads the alert-dialog strings', () => {
    it('its buttons and the type-to-confirm sentence follow the locale', async () => {
        setComponentStrings('alert-dialog', { confirm: 'Conferma', cancel: 'Annulla', typeToConfirm: 'Scrivi {text} per confermare:' });
        document.body.innerHTML = '<pdx-overlay-outlet></pdx-overlay-outlet>';
        void dialog.confirm({ title: 'Elimina', message: 'Sicuro?', confirmText: 'ELIMINA' });
        const confirm = await rendered(() => document.querySelector('.pdx-alert-confirm'));
        expect(confirm.textContent).toBe('Conferma');
        expect(document.querySelector('.pdx-alert-cancel')!.textContent).toBe('Annulla');
        const sentence = document.querySelector('strong')!.parentElement!;
        expect(sentence.textContent).toBe('Scrivi ELIMINA per confermare:');
        expect(sentence.querySelector('strong')!.textContent, 'the text to type keeps its <strong>').toBe('ELIMINA');
    });

    it('the control: confirmLabel and cancelLabel still win', async () => {
        setComponentStrings('alert-dialog', { confirm: 'Conferma', cancel: 'Annulla' });
        document.body.innerHTML = '<pdx-overlay-outlet></pdx-overlay-outlet>';
        void dialog.confirm({ title: 'T', confirmLabel: 'Sì, elimina', cancelLabel: 'No' });
        const confirm = await rendered(() => document.querySelector('.pdx-alert-confirm'));
        expect(confirm.textContent).toBe('Sì, elimina');
        expect(document.querySelector('.pdx-alert-cancel')!.textContent).toBe('No');
    });

    it('the alert service\'s button is overlay.ok', async () => {
        setComponentStrings('overlay', { ok: 'Va bene' });
        document.body.innerHTML = '<pdx-overlay-outlet></pdx-overlay-outlet>';
        void dialog.alert({ title: 'Info', message: 'Fatto.' });
        const ok = await rendered(() => document.querySelector('.pdx-alert-ok'));
        expect(ok.textContent).toBe('Va bene');
    });
});

describe('strings inside a template or built around a value', () => {
    it('pdx-alert-dialog: the type-to-confirm sentence, split around its <strong>', async () => {
        setComponentStrings('alert-dialog', { typeToConfirm: 'Scrivi {text} per confermare:' });
        document.body.innerHTML = '<pdx-alert-dialog confirm-text="ELIMINA"></pdx-alert-dialog>';
        const strong = await rendered(() => document.querySelector('.pdx-dialog-body p strong'));
        expect(strong.textContent).toBe('ELIMINA');
        expect(strong.parentElement!.textContent).toBe('Scrivi ELIMINA per confermare:');
    });

    it('pdx-command: the footer hints', async () => {
        setComponentStrings('command', { navigate: 'Naviga', select: 'Scegli', close: 'Chiudi' });
        document.body.innerHTML = '<pdx-command></pdx-command>';
        const footer = await rendered(() => document.querySelector('.pdx-command-footer'));
        expect(footer.textContent!.replace(/\s+/g, ' ').trim()).toBe('↑↓ Naviga ↵ Scegli ESC Chiudi');
    });

    it('pdx-password-input: the toggle is named show or hide', async () => {
        setComponentStrings('password-input', { show: 'Mostra', hide: 'Nascondi' });
        document.body.innerHTML = '<pdx-password-input></pdx-password-input>';
        const toggle = await rendered(() => document.querySelector<HTMLElement>('button[aria-label]'));
        expect(toggle.getAttribute('aria-label')).toBe('Mostra');
        toggle.click();
        await vi.waitFor(() => { expect(toggle.getAttribute('aria-label')).toBe('Nascondi'); }, { timeout: 2000 });
    });

    it('pdx-badge: a dot is named with its variant in the string', async () => {
        setComponentStrings('badge', { indicator: 'indicatore {variant}' });
        document.body.innerHTML = '<pdx-badge dot variant="danger"></pdx-badge>';
        const dot = await rendered(() => document.querySelector('[aria-label]'));
        expect(dot.getAttribute('aria-label')).toBe('indicatore danger');
    });

    it('pdx-select: the remove button of a chip, and the summary chip', async () => {
        setComponentStrings('select', { remove: 'Togli {label}', selected: '{n} scelti' });
        document.body.innerHTML = '<pdx-select multiple></pdx-select>';
        const el = document.body.firstElementChild as HTMLElement & { options: string[]; value: string[]; maxTagCount: number };
        el.options = ['Rossi', 'Verdi'];
        el.value = ['Rossi'];
        const remove = await rendered(() => el.querySelector('.pdx-chip-remove'));
        expect(remove.getAttribute('aria-label')).toBe('Togli Rossi');
        el.maxTagCount = 0;
        const summary = await rendered(() => el.querySelector('.pdx-chip-summary'));
        expect(summary.textContent!.trim()).toBe('1 scelti');
    });

    it('pdx-tag-input: the remove button of a tag', async () => {
        setComponentStrings('tag-input', { remove: 'Togli {tag}' });
        document.body.innerHTML = '<pdx-tag-input></pdx-tag-input>';
        const el = document.body.firstElementChild as HTMLElement & { value: string[] };
        el.value = ['urgente'];
        const remove = await rendered(() => el.querySelector('.pdx-chip-remove'));
        expect(remove.getAttribute('aria-label')).toBe('Togli urgente');
    });

    it('pdx-file-upload: the size hint', async () => {
        setComponentStrings('file-upload', { maxSize: 'Massimo {size}' });
        document.body.innerHTML = '<pdx-file-upload max-size="1048576"></pdx-file-upload>';
        await vi.waitFor(() => { expect(document.body.textContent).toContain('Massimo 1'); }, { timeout: 2000 });
    });

    it('pdx-inline-edit: the editor\'s name when it has no name or placeholder', async () => {
        setComponentStrings('inline-edit', { label: 'Modifica valore', edit: 'Modifica {value}' });
        // With a value, the name says which one.
        document.body.innerHTML = '<pdx-inline-edit value="x"></pdx-inline-edit><pdx-inline-edit></pdx-inline-edit>';
        const [withValue, empty] = Array.from(document.body.children) as (HTMLElement & { startEdit(): void })[];
        await rendered(() => withValue.querySelector('.pdx-inline-edit-display'));
        withValue.startEdit();
        const input = await rendered(() => withValue.querySelector('input'));
        expect(input.getAttribute('aria-label')).toBe('Modifica x');
        // With nothing to name it after, the generic name.
        await rendered(() => empty.querySelector('.pdx-inline-edit-display'));
        empty.startEdit();
        const emptyInput = await rendered(() => empty.querySelector('input'));
        expect(emptyInput.getAttribute('aria-label')).toBe('Modifica valore');
    });
});
