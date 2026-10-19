// What the lifecycle scenario's pages read and count, shared with the spec through `window.__lc`.
import { signal } from '@pdxui/core';

export const lc = {
    /** A signal the kept page's effect and its @title read. */
    tick: signal(0),
    /** The promise the kept page's @await waits for; a new one restarts its timers. */
    wait: signal<Promise<unknown>>(new Promise(() => {})),
    /** How many times the kept page's effect ran. */
    effectRuns: 0,
    /** Requests by path, counted by the mock transport. */
    requests: {} as Record<string, number>,
    /** Writes to document.title. */
    titleWrites: 0,
    /** onHide / onShow of the kept `<component :is>` views, by tag. */
    hidden: {} as Record<string, number>,
    shown: {} as Record<string, number>,
};
