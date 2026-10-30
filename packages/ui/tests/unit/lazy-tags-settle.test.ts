// settlePrefetches() waits for a prefetch whether or not idle time has come (#603).
//
// Its own module graph: nothing else in this file loads the prefetched tags.

import { describe, it, expect, vi } from 'vitest';

// Idle time never comes here: what settles the prefetch has to start it.
vi.stubGlobal('requestIdleCallback', () => 0);
const { createLazy, prefetchTags, settlePrefetches } = await import('../../src/shared/lazy-tags');

describe('settlePrefetches', () => {
    // A cold module load under the gate's load takes seconds, as in data-grid-editor-before-module.
    it('starts a prefetch still waiting for idle time and resolves once its tag is defined', async () => {
        prefetchTags(['pdx-input']);
        expect(customElements.get('pdx-input')).toBeUndefined();
        await settlePrefetches();
        expect(customElements.get('pdx-input'), 'pdx-input').toBeDefined();
    }, 10_000);

    // An element created from code on a user's action loads its module there and then, not on idle
    // time: a filter popover's text field (#745). The file that opened it ended under that load.
    it('waits for the load an element created from code started, too', async () => {
        expect(customElements.get('pdx-date-picker')).toBeUndefined();
        createLazy('pdx-date-picker');
        await settlePrefetches();
        expect(customElements.get('pdx-date-picker'), 'pdx-date-picker').toBeDefined();
    }, 10_000);

    it('resolves at once when nothing is pending', async () => {
        await expect(settlePrefetches()).resolves.toBeUndefined();
    });
});
