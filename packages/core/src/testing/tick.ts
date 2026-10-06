// Testing utility: flush signal effects and microtasks.

/**
 * Flush all pending signal effects and microtasks.
 * Useful after signal.set() to verify DOM updates.
 */
export async function tick(): Promise<void> {
    // Flush microtasks (signal effects are synchronous, but
    // some operations like resource() schedule microtasks)
    await new Promise<void>(r => queueMicrotask(r));
    // Double flush to catch effects triggered by effects
    await new Promise<void>(r => queueMicrotask(r));
}
