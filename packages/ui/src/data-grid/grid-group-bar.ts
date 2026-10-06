// Grid group bar — drop zone for column drag-to-group.
// Shows active group chips with remove (✕). Accepts drag from header cells.

import type { GridContext, AnyColumn } from './grid-context';
import { t } from './grid-i18n';

export function buildGroupBar(gc: GridContext): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'pdx-dg-group-bar';

    // Drop zone listeners — attached once, survive innerHTML updates
    bar.addEventListener('dragover', (e) => {
        if (!e.dataTransfer?.types.includes('text/plain')) return;
        e.preventDefault();
        e.dataTransfer!.dropEffect = 'move';
        bar.classList.add('pdx-dg-group-bar-active');
    });

    bar.addEventListener('dragleave', (e) => {
        // Only deactivate if leaving the bar entirely (not entering a child element)
        if (e.relatedTarget && bar.contains(e.relatedTarget as Node)) return;
        bar.classList.remove('pdx-dg-group-bar-active');
    });

    bar.addEventListener('drop', (e) => {
        e.preventDefault();
        bar.classList.remove('pdx-dg-group-bar-active');

        const field = e.dataTransfer?.getData('text/plain');
        if (!field || !gc.grid) return;

        // Read current group descriptors (not results)
        const groupSignal = gc.grid.source.group;
        const current = typeof groupSignal === 'function' ? groupSignal() : [];
        const existing = Array.isArray(current) ? current : [];
        if (existing.some((g: any) => g.field === field)) return;

        gc.grid.source.setGroup([...existing, { field }] as any);
    });

    updateGroupBar(gc, bar);
    return bar;
}

export function updateGroupBar(gc: GridContext, bar: HTMLElement): void {
    bar.innerHTML = '';

    // Read group DESCRIPTORS (GroupDescriptor[]), not group RESULTS (GroupResult[])
    const groupSignal = gc.grid?.source.group;
    const groupDescs = typeof groupSignal === 'function' ? groupSignal() : undefined;

    if (!groupDescs || !Array.isArray(groupDescs) || groupDescs.length === 0) {
        const hint = document.createElement('span');
        hint.className = 'pdx-dg-group-bar-hint';
        hint.textContent = t('groupBar.dropHere');
        bar.appendChild(hint);
        return;
    }

    for (const gd of groupDescs) {
        const cols = gc.grid?.columns.peek() as AnyColumn[] ?? [];
        const col = cols.find(c => c.field === gd.field);
        const headerText = col?.header ?? gd.field;

        const chip = document.createElement('span');
        chip.className = 'pdx-dg-toolbar-chip pdx-dg-toolbar-chip-group';

        const text = document.createElement('span');
        text.textContent = headerText;
        chip.appendChild(text);

        const remove = document.createElement('button');
        remove.type = 'button';   // not submit: a grid inside a form would submit it
        remove.className = 'pdx-dg-toolbar-chip-remove';
        remove.textContent = '✕';
        remove.setAttribute('aria-label', t('group.remove').replace('{column}', String(headerText)));
        remove.addEventListener('click', (e) => {
            e.stopPropagation();
            removeGroup(gc, gd.field);
        });
        chip.appendChild(remove);

        bar.appendChild(chip);
    }

    const hint = document.createElement('span');
    hint.className = 'pdx-dg-group-bar-hint pdx-dg-group-bar-hint-sm';
    hint.textContent = '+';
    bar.appendChild(hint);
}

function removeGroup(gc: GridContext, field: string): void {
    if (!gc.grid) return;
    const groupSignal = gc.grid.source.group;
    const current = typeof groupSignal === 'function' ? groupSignal() : [];
    const existing = Array.isArray(current) ? current : [];
    const updated = existing.filter((g: any) => g.field !== field);
    gc.grid.source.setGroup(updated.length > 0 ? updated as any : []);
}
