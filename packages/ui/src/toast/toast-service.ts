// Toast service — the global queue `<pdx-toast>` draws, and the programmatic API that adds to it.
// Usage: import { toast } from '@pdxui/ui/toast';
// Its own module since pdx-toast moved to .pdx (#1210): a component's script holds no module state,
// and the entry re-exports both from here (#1352).

import { createToastQueue } from '@pdxui/core';
import type { ToastQueue } from '@pdxui/core';

let _globalQueue: ToastQueue | null = null;

export function getToastQueue(): ToastQueue {
    if (!_globalQueue) _globalQueue = createToastQueue();
    return _globalQueue;
}

/** Global toast API. */
export const toast = {
    success: (msg: string, opts?: any) => getToastQueue().success(msg, opts),
    error: (msg: string, opts?: any) => getToastQueue().error(msg, opts),
    warning: (msg: string, opts?: any) => getToastQueue().warning(msg, opts),
    info: (msg: string, opts?: any) => getToastQueue().info(msg, opts),
    promise: (p: any, msgs: any, opts?: any) => getToastQueue().promise(p, msgs, opts),
    dismiss: (id: string) => getToastQueue().dismiss(id),
    clear: () => getToastQueue().clear(),
    /** Add with full options. */
    add: (data: any) => getToastQueue().add(data),
};
