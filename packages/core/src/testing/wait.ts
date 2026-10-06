// Testing utility: poll-based condition waiting.

/**
 * Wait for a condition function to return true.
 * Polls every 50ms, throws after timeout (default 3000ms).
 */
export async function waitFor(
    condition: () => boolean | Promise<boolean>,
    timeout = 3000,
): Promise<void> {
    const start = Date.now();
    const interval = 50;

    while (true) {
        const result = await condition();
        if (result) return;

        if (Date.now() - start >= timeout) {
            throw new Error(`waitFor() timed out after ${timeout}ms`);
        }

        await new Promise<void>(r => setTimeout(r, interval));
    }
}
