// The rail's Recents: the LISTS opened lately, not single records (the owner's choice). Each person's
// own, under a key with their id; a visitor who has not signed in has the guest's. Stored longer than
// shown, so unpinning a favourite brings it back here.
//
// The list IS a signal (CD-S3), not a version counter every write has to bump so a `$derived` re-reads
// storage: a write sets it, a change of person
// reads theirs, and whatever shows the recents depends on the value rather than on a counter.
import { signal, computed, effect, watch } from '@pdxui/core';
import type { ReadonlySignal } from '@pdxui/core';
import { listOf } from './nav-model';

const RECENTS_SHOWN = 5;
const RECENTS_KEPT = 8;

/**
 * The recents for whoever `user` names, noted from `path`. `pins` are left out of what is shown: a
 * favourite is in the rail already. Call it in a component's setup: its effect and its watch are
 * disposed with the component.
 */
export function createRecents(
    path: () => string,
    pins: () => string[],
    user: () => string,
): { shown: ReadonlySignal<string[]> } {
    const key = (): string => 'showcase.recents.' + (user() || 'guest');
    const list = signal<string[]>([]);

    // Whose recents: read again when the person changes.
    effect(() => { list.set(JSON.parse(localStorage.getItem(key()) ?? '[]')); });

    function note(p: string): void {
        const recent = listOf(p);
        if (!recent) return;
        const next = [recent, ...list().filter(k => k !== recent)].slice(0, RECENTS_KEPT);
        localStorage.setItem(key(), JSON.stringify(next));
        list.set(next);
    }
    watch(path, (p) => note(p), { immediate: true });

    return { shown: computed(() => list().filter(k => !pins().includes(k)).slice(0, RECENTS_SHOWN)) };
}
