// The demo's own controls, out of the product's screens.
//
// The showcase fakes its backend, and a fake backend needs a hand on it: fail the next archive,
// drop the live connection, let a colleague close a ticket at another desk. Drawn in the screens,
// like the screens' own actions, those controls leave a reader unable to tell «Archive» from «Make
// the next archive fail». They are the demo's, so they live in ONE place the shell draws — the Demo
// panel in the service bar — and a screen only says which ones it has.
//
// A screen registers its knobs on mount and they leave with it: the panel shows the current
// screen's and nothing else.

import { signal } from '@pdxui/core';

export interface DemoKnob {
    /** The `data-test` the control keeps, so a spec reaches it by a stable name. */
    test: string;
    /** A dictionary key: the panel translates it, in the page's language. */
    label: string;
    run: () => void;
    /** Shown only while this is true: one of a pair, such as drop the connection / reconnect. */
    when?: () => boolean;
    /** A dictionary key heading the knobs that share it. */
    group?: string;
}

const registered = signal<DemoKnob[]>([]);

/** What the panel draws: every knob registered now, in registration order. Reactive. */
export function demoKnobs(): DemoKnob[] {
    return registered();
}

/**
 * Put a screen's knobs in the Demo panel. Returns the function that takes them out again — call it
 * on destroy: `onMount(() => onDestroy(registerDemo([...])))`.
 */
export function registerDemo(knobs: DemoKnob[]): () => void {
    registered.set((all) => [...all, ...knobs]);
    return () => registered.set((all) => all.filter((k) => !knobs.includes(k)));
}
