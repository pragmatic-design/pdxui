// useTitle — reactive document.title binding.

import { effect } from '../reactivity/signal';

const isBrowser = typeof document !== 'undefined';

/**
 * Reactively set document.title. Updates whenever signal dependencies change.
 *
 * Usage:
 *   useTitle(() => `${count()} items — My App`);
 */
export function useTitle(titleFn: () => string): void {
    if (!isBrowser) return;
    effect(() => {
        document.title = titleFn();
    });
}
