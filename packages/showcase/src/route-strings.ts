// Every navigation holds until its dictionary is in — the NAVIGATION, not the paint.
//
// The outlet is not gated on it: `@if (ready)` in `app.pdx` going false for one tick UNMOUNTS the
// whole tree, so a ticket's billing tab would tear down the ticket underneath it and build it again
// — `master-detail.spec.ts` counts the parent's mounts and wants 1. `onBeforeNavigate` is awaited
// before the address changes, so the screen the visitor is on stays put while the strings for the
// next one arrive.
//
// A module and not the shell's setup: a build that generates a page (#160) runs these hooks for the
// path before it renders it, and a hook a component's setup registers arrives with the render, too
// late to have loaded anything. Here it is in place before any page is.

import { onBeforeNavigate, prefetchRoute } from '@pdxui/router';
import { ensureSections } from './i18n';

onBeforeNavigate(async (_from, to) => {
    prefetchRoute(to);   // the chunk alongside the strings, as at boot
    await ensureSections(to);
    return true;
});
