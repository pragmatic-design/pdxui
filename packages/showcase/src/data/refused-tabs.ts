// A refused value on another tab, as its own concern.
//
// A tabbed form with rules needs it: a tab says how many of its fields hold a value the rules
// refused, and «Not saved» leads to the first one — its tab opens and the field takes the focus.
import { signal, computed } from '@pdxui/core';
import type { Form, ReadonlySignal } from '@pdxui/core';

/** The `pdx-tabs` element, as this reads it: its panels, and `select`. */
interface TabsHandle extends HTMLElement { select(key: string): void }

export interface RefusedTabs {
    /** Read which tab holds each field. Call it once the tabs are drawn (onMount). */
    read(): void;
    /** Each tab's count of fields the user has been at whose value the rules refuse. */
    counts: ReadonlySignal<Record<string, number>>;
    /** Open the tab of the first refused field and put the focus on it. */
    goToFirst(): void;
}

export function createRefusedTabs(form: Form<Record<string, unknown>>, tabs: () => TabsHandle | null): RefusedTabs {
    /**
     * Which tab holds each field, in the order the template draws them — the first refused is the
     * first on screen. Read from the panels, so a field moved in the template cannot be counted on
     * the tab it left, and a field inside a section component is found like any other.
     */
    const tabFields = signal<Record<string, string[]>>({});

    const refusedNow = (name: string, errors: Record<string, unknown>) =>
        !!errors[name] && !!form.fields[name]?.touched();

    const counts = computed(() => {
        const errors = form.errors() as Record<string, unknown>;
        return Object.fromEntries(Object.entries(tabFields()).map(([key, names]) =>
            [key, names.filter(name => refusedNow(name, errors)).length]));
    });

    return {
        read() {
            const el = tabs();
            if (!el) return;
            const map: Record<string, string[]> = {};
            for (const panel of el.querySelectorAll<HTMLElement>('[data-tab-panel]')) {
                map[panel.dataset.tabPanel ?? ''] = [...panel.querySelectorAll('pdx-form-field[name]')]
                    .map(f => f.getAttribute('name') ?? '');
            }
            tabFields.set(map);
        },
        counts,
        goToFirst() {
            const errors = form.errors() as Record<string, unknown>;
            for (const [key, names] of Object.entries(tabFields.peek())) {
                const name = names.find(n => refusedNow(n, errors));
                if (!name) continue;
                const el = tabs();
                el?.select(key);
                // The panel is shown on the next frame; a hidden control cannot take the focus.
                requestAnimationFrame(() => {
                    const field = el?.querySelector(`[data-test="${name}"]`);
                    field?.querySelector<HTMLElement>('input, textarea, [role="combobox"], [tabindex]')?.focus();
                });
                return;
            }
        },
    };
}
