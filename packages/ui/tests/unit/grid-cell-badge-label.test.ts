// A badge or a status cell shows the column's LABEL for its value, toned by the value.
//
// A status is stored as a code — `active`, `onboarding` — and a screen shows it translated. The
// grid's own warning says «to relabel a value, use format», so `badge()` honours `format`: a badge
// that wrote the raw code could not draw a translated, toned status at all, and an Italian screen
// would read «active» and «onboarding».

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import { badge, status } from '@pdxui/core';
import '../../src/data-grid/pdx-data-grid';

const ROWS = [
    { id: 1, name: 'Ada', state: 'active' },
    { id: 2, name: 'Grace', state: 'closed' },
];
const LABELS: Record<string, string> = { active: 'Attivo', closed: 'Chiuso' };

async function mountGrid(columns: unknown[]): Promise<HTMLElement> {
    const el = document.createElement('pdx-data-grid') as HTMLElement & { columns: unknown; data: unknown };
    el.columns = columns;
    el.data = ROWS.map(r => ({ ...r }));
    document.body.appendChild(el);
    await tick(30);
    return el;
}

describe('a badge or status cell with a format', () => {
    beforeEach(cleanup);

    it('a badge shows the formatted label, and keeps the tone of the raw value', async () => {
        const el = await mountGrid([{ field: 'state', header: 'State',
            format: (v: unknown) => LABELS[String(v)], cell: badge({ tones: { active: 'success' } }) }]);
        const badges = [...el.querySelectorAll<HTMLElement>('.pdx-dg-badge')];
        expect(badges.map(b => b.textContent), 'the badge shows the stored code').toEqual(['Attivo', 'Chiuso']);
        expect(badges[0].classList.contains('pdx-dg-badge-success'), 'the tone was looked up by the label').toBe(true);
        expect(badges[1].classList.contains('pdx-dg-badge-muted')).toBe(true);
    });

    it('a status cell does the same', async () => {
        const el = await mountGrid([{ field: 'state', header: 'State',
            format: (v: unknown) => LABELS[String(v)], cell: status({ tones: { active: 'success' } }) }]);
        const cells = [...el.querySelectorAll<HTMLElement>('.pdx-dg-status')];
        expect(cells.map(c => c.textContent), 'the status shows the stored code').toEqual(['Attivo', 'Chiuso']);
        expect(cells[0].classList.contains('pdx-dg-status-success')).toBe(true);
    });

    it('control — without a format, a badge shows the value as before', async () => {
        const el = await mountGrid([{ field: 'state', header: 'State', cell: badge() }]);
        expect([...el.querySelectorAll('.pdx-dg-badge')].map(b => b.textContent)).toEqual(['active', 'closed']);
    });

    it('control — a label is text, never markup', async () => {
        const el = await mountGrid([{ field: 'state', header: 'State',
            format: () => '<img src=x onerror=alert(1)>', cell: badge() }]);
        expect(el.querySelector('.pdx-dg-badge img'), 'the label reached innerHTML').toBeNull();
        expect(el.querySelector('.pdx-dg-badge')?.textContent).toBe('<img src=x onerror=alert(1)>');
    });
});
