// useTitle — reactive document.title binding.

import { effect, untracked } from '../reactivity/signal';
import { serverHeadSink } from './head';

const isBrowser = typeof document !== 'undefined';

/**
 * Reactively set document.title. Updates whenever signal dependencies change.
 *
 * Usage:
 *   useTitle(() => `${count()} items — My App`);
 */
export function useTitle(titleFn: () => string): void {
    // On the server (#160): the title the page is written with, read once.
    if (serverHeadSink) {
        serverHeadSink({ title: untracked(titleFn) });
        return;
    }
    if (!isBrowser) return;
    effect(() => {
        document.title = titleFn();
    });
}
