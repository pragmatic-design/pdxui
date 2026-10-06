// pdx-open, pdx-close and pdx-toggle stay on the component that emits them.
//
// A dialog must not vanish when a value is picked from a select inside it: a bubbling pdx-close from
// the select would reach the dialog's @pdx-close, which is there to learn that the USER closed the
// dialog. A test that listens on the component itself never nests one popup in another, so this one
// does. These three describe the component's own popup state and do not bubble, like the native
// close of <dialog> and toggle of <details>; pdx-change keeps bubbling, like change.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { cleanup, tick } from './helpers';
import '../../src/dialog/pdx-dialog';
import '../../src/drawer/pdx-drawer';
import '../../src/select/pdx-select';
import '../../src/date-picker/pdx-date-picker';
import '../../src/form/pdx-form';
import '../../src/input/pdx-input';
import { createForm } from '@pdxui/core';

/** `outer` open, `inner` inside it, both in the document. */
async function nest(outerTag: string, innerTag: string, setup: (inner: HTMLElement) => void): Promise<{ outer: HTMLElement; inner: HTMLElement }> {
    const outer = document.createElement(outerTag);
    outer.setAttribute('open', '');
    outer.setAttribute('title', 'Appointment');
    outer.setAttribute('label', 'Appointment');
    const inner = document.createElement(innerTag);
    setup(inner);
    outer.appendChild(inner);
    document.body.appendChild(outer);
    await tick(50);
    return { outer, inner };
}

function count(el: HTMLElement, type: string): () => number {
    let n = 0;
    el.addEventListener(type, () => { n++; });
    return () => n;
}

describe('a popup inside a popup: the inner one\'s events stay on it', () => {
    beforeEach(cleanup);

    it('pdx-select in pdx-dialog: the select\'s open and close do not reach the dialog', async () => {
        const { outer, inner } = await nest('pdx-dialog', 'pdx-select', (s) => {
            (s as HTMLElement & { options: unknown[] }).options = [{ value: 'rossi', label: 'Dr. Rossi' }];
        });
        const dialogCloses = count(outer, 'pdx-close');
        const dialogOpens = count(outer, 'pdx-open');
        const selectCloses = count(inner, 'pdx-close');

        const trigger = inner.querySelector('.pdx-select-trigger') as HTMLElement;
        trigger.click();
        await tick(20);
        trigger.click();
        await tick(20);

        expect(selectCloses(), 'the select did not announce its own close').toBe(1);
        expect(dialogCloses(), 'the dialog heard the select close, and an app would close the dialog').toBe(0);
        expect(dialogOpens()).toBe(0);
    });

    it('pdx-date-picker in pdx-drawer: the picker\'s close does not reach the drawer', async () => {
        const { outer, inner } = await nest('pdx-drawer', 'pdx-date-picker', (d) => d.setAttribute('value', '2026-09-11'));
        const drawerCloses = count(outer, 'pdx-close');
        const pickerCloses = count(inner, 'pdx-close');

        const trigger = inner.querySelector('.pdx-date-picker-trigger') as HTMLElement;
        trigger.click();
        await tick(50);
        trigger.click();
        await tick(50);

        expect(pickerCloses()).toBe(1);
        expect(drawerCloses(), 'the drawer heard the picker close').toBe(0);
    });

    it('control — a pdx-change from a pdx-input still reaches a listener on the pdx-form around it', async () => {
        const form = document.createElement('pdx-form') as HTMLElement & { form: unknown };
        form.form = createForm({ initialValues: { name: '' } });
        const input = document.createElement('pdx-input');
        form.appendChild(input);
        document.body.appendChild(form);
        await tick(50);
        const formChanges = count(form, 'pdx-change');

        const native = input.querySelector('input') as HTMLInputElement;
        native.value = 'Rex';
        native.dispatchEvent(new Event('change', { bubbles: true }));
        await tick(10);

        expect(formChanges(), 'pdx-change must keep bubbling, like the native change').toBe(1);
    });
});

// ─── Guard: every emission of the three names says bubbles: false ───────────
// A new component that emits a bubbling pdx-close puts the vanishing dialog back, silently.
describe('guard: pdx-open, pdx-close and pdx-toggle are emitted with { bubbles: false }', () => {
    const SRC = join(__dirname, '../../src');
    const files = (dir: string, acc: string[] = []): string[] => {
        for (const e of readdirSync(dir)) {
            const p = join(dir, e);
            if (statSync(p).isDirectory()) files(p, acc);
            else if (e.endsWith('.ts')) acc.push(p);
        }
        return acc;
    };

    it('finds emissions to check at all', () => {
        const hits = files(SRC).flatMap((f) => readFileSync(f, 'utf8').match(/emit\(\s*'pdx-(open|close|toggle)'/g) ?? []);
        // A zero here would make the assertion below pass by measuring nothing.
        expect(hits.length).toBeGreaterThan(10);
    });

    it('no emission of the three names without bubbles: false', () => {
        const offenders: string[] = [];
        // Match: emit('pdx-close'  |  new CustomEvent('pdx-open'  — then the rest of that call's line.
        const re = /(?:emit\(|new CustomEvent\()\s*['"`](pdx-open|pdx-close|pdx-toggle)['"`][^\n]*/g;
        for (const f of files(SRC)) {
            const text = readFileSync(f, 'utf8');
            let m: RegExpExecArray | null;
            while ((m = re.exec(text)) !== null) {
                if (!/bubbles:\s*false/.test(m[0])) {
                    const line = text.slice(0, m.index).split('\n').length;
                    offenders.push(`${relative(SRC, f)}:${line}  ${m[0].trim()}`);
                }
            }
        }
        expect(offenders, 'these still bubble to every ancestor').toEqual([]);
    });
});
