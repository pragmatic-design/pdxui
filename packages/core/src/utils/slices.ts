/**
 * processInSlices (#240): run a long loop over data without blocking input.
 *
 * A component that filters, groups or formats 100 000 items in one task leaves the page deaf to a
 * click until it ends. This calls `work` for each item in order, and after each slice of about
 * 5 ms of work yields to the browser, so input and rendering run between slices.
 *
 * It splits the developer's own loop, never the reactive graph: signal writes made by `work` are
 * ordinary writes and flush as any write outside a handler does.
 */

/** The work done between two yields, in milliseconds. */
const SLICE_MS = 5;

export interface SliceOptions {
    /** Stops the job before the next item: the promise rejects with the signal's reason. */
    signal?: AbortSignal;
}

/**
 * Give the browser a turn: a macrotask through a MessageChannel. Not `setTimeout`, whose clamping
 * to 4 ms adds up over thousands of slices. Not `scheduler.yield()` either: its continuation runs
 * ahead of other tasks, rendering among them. Measured in Chromium (`slices-long-task.spec.ts`), a
 * job that yields that way while the page has something to paint holds the frame for about 100 ms,
 * and a timer waits for the whole job; through a MessageChannel no frame reaches 50 ms.
 */
function yieldToBrowser(): Promise<void> {
    return new Promise((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = () => {
            channel.port1.close();
            resolve();
        };
        channel.port2.postMessage(null);
    });
}

function abortReason(signal: AbortSignal): unknown {
    return signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
}

/**
 * Call `work(item, index)` for every item, in order, yielding to input after each slice of about
 * 5 ms. Resolves when every item has been processed; rejects with the signal's reason when
 * `options.signal` aborts (no later item is processed), or with the error `work` throws.
 */
export async function processInSlices<T>(
    items: ArrayLike<T>,
    work: (item: T, index: number) => void,
    options: SliceOptions = {},
): Promise<void> {
    const { signal } = options;
    const length = items.length;
    let index = 0;
    while (index < length) {
        if (signal?.aborted) throw abortReason(signal);
        const sliceStart = performance.now();
        do {
            work(items[index], index);
            index++;
            if (signal?.aborted) throw abortReason(signal);
        } while (index < length && performance.now() - sliceStart < SLICE_MS);
        if (index < length) await yieldToBrowser();
    }
}
