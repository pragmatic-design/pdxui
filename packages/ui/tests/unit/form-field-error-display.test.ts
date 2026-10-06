// pdx-form-field shows its error message only when the field is touched, when `show-error` is set, or
// when its form validates onChange. Inside a form that is right: a field should not shout while the
// user is still typing. Outside one, an error decided by code (a server rejection, a check on save)
// set alone stays invisible, and a catalogue row saying only «Marks the control as invalid» leaves an
// agent that sets `error` seeing nothing. The row states the rule. These tests pin both halves,
// what the catalogue says and that the component does it, so the sentence cannot drift.

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, mount } from './helpers';
import '../../src/form-field/pdx-form-field';

const UI = join(__dirname, '..', '..');
// The component's page in the pdxui-forms skill.
const FORMS_SKILL = join(UI, '..', '..', 'marketplace', 'plugins', 'pdxui', 'skills', 'pdxui-forms', 'references', 'pdx-form-field.md');

interface CemMember { name: string; description?: string }
interface CemDeclaration { tagName?: string; members?: CemMember[] }

/** The `error` prop's description in the committed custom-elements.json. */
function manifestErrorDescription(): string {
    const cem = JSON.parse(readFileSync(join(UI, 'custom-elements.json'), 'utf8')) as { modules: { declarations?: CemDeclaration[] }[] };
    const decl = cem.modules.flatMap(m => m.declarations ?? []).find(d => d.tagName === 'pdx-form-field');
    return decl?.members?.find(m => m.name === 'error')?.description ?? '';
}

/** The `error` row of the pdx-form-field table in the generated pdxui-forms catalogue. */
function catalogueErrorRow(): string {
    const text = readFileSync(FORMS_SKILL, 'utf8').replace(/\r\n/g, '\n');
    const section = text.split(/^### /m).find(s => s.startsWith('`<pdx-form-field>`')) ?? '';
    return section.split('\n').find(l => l.startsWith('| `error` |')) ?? '';
}

describe('pdx-form-field: when the error message shows is written where the agent reads', () => {
    for (const [where, read] of [['custom-elements.json', manifestErrorDescription], ['the pdxui-forms catalogue', catalogueErrorRow]] as const) {
        it(`${where}: the error row names touched, show-error and onChange`, () => {
            const row = read();
            expect(row, 'the row was not found').not.toBe('');
            expect(row).toMatch(/touched/);
            expect(row).toMatch(/show-error/);
            expect(row).toMatch(/onChange/);
        });
    }
});

describe('pdx-form-field: the rule the row states', () => {
    beforeEach(cleanup);

    it('error alone, outside a form: no message', async () => {
        const el = await mount('pdx-form-field', { error: 'Wrong PIN' });
        expect(el.querySelector('.pdx-field-error')).toBeNull();
        expect(el.querySelector('.pdx-form-field')?.classList.contains('has-error')).toBe(false);
    });

    it('error with the show-error attribute, as the note writes it: the message shows', async () => {
        const el = await mount('pdx-form-field', { error: 'Wrong PIN', 'show-error': '' });
        const message = el.querySelector('.pdx-field-error');
        expect(message?.textContent).toBe('Wrong PIN');
        expect(message?.getAttribute('role')).toBe('alert');
    });

    it('error on a touched field: the message shows', async () => {
        const el = await mount('pdx-form-field', { error: 'Wrong PIN', touched: '' });
        expect(el.querySelector('.pdx-field-error')?.textContent).toBe('Wrong PIN');
    });
});
