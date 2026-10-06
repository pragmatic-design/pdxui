// The design half of the diagnostics catalog: questions a heuristic raises for a review, and the
// rules that read several files at once. See catalog.ts and docs/PDX-COMPONENT-DESIGN.md §8.

import type { DiagnosticEntry } from './catalog';

const T = 'packages/compiler/tests/';

export const DESIGN: Record<string, DiagnosticEntry> = {
    PDX_SEVERAL_PIECES: {
        severity: 'warn', category: 'design',
        summary: 'One script holds several groups of state that share nothing (CD-B1, a heuristic).',
        explanation: 'Each group is a piece with its own state — a component of its own. Kept together, they grow together.',
        fix: 'Move each group, with its markup, into a `.pdx` beside this one; what joins them stays here.',
        reproducedIn: `${T}design-heuristics.test.ts`,
    },
    PDX_VERSION_COUNTER: {
        severity: 'warn', category: 'design',
        summary: 'A `$signal` only ever bumped, and read only to be discarded (CD-S3, a heuristic).',
        explanation: 'A counter that forces a re-read means the state it stands for should itself be a signal.',
        fix: 'Give the state one reactive owner — a small module holding a signal — and read that.',
        reproducedIn: `${T}design-heuristics.test.ts`,
    },
    PDX_ROUTE_RENDERS: {
        severity: 'warn', category: 'design',
        summary: 'A route that renders many structural blocks inline, none a component (CD-B2, a heuristic).',
        explanation: 'A route composes the pieces of its screen; carrying their markup makes it the place every change lands.',
        fix: 'Move each block into a `.pdx` of its own and compose them in the route.',
        reproducedIn: `${T}design-heuristics.test.ts`,
    },
    PDX_SHARED_STYLES: {
        severity: 'warn', category: 'design',
        summary: 'One stylesheet serves several of the pieces CD-B1 finds (CD-C1, a heuristic).',
        explanation: 'When the pieces become components, the rules that belong to each have to be found and moved.',
        fix: 'Give each piece its own `<style scoped>`; keep here only what lays them out.',
        reproducedIn: `${T}design-heuristics.test.ts`,
    },
    PDX_COLOUR_LITERAL: {
        severity: 'warn', category: 'design',
        summary: 'A colour written as a value in a `.pdx` style (CD-C3).',
        explanation: 'A literal colour is right in one theme and wrong in the other twelve, and in dark mode.',
        fix: 'Use a token: `var(--pdx-color-*)`, the `*-ink` colours for text, `*-soft` for tints.',
        reproducedIn: `${T}design-heuristics.test.ts`,
    },
    PDX_EFFECT_STATE: {
        severity: 'warn', category: 'design',
        summary: 'State written by an effect from what the effect reads (CD-D2, a heuristic).',
        explanation: 'If the value follows from its sources it is a `$derived`, and the effect is a second copy that can lag behind.',
        fix: 'Declare it with `$derived(…)`; keep effects for what leaves the component — storage, the URL, the DOM, a request.',
        reproducedIn: `${T}design-checks-data-flow.test.ts`,
    },
    PDX_REPEATED_LOGIC: {
        severity: 'warn', category: 'design',
        summary: 'The same logic written in the same shape in several files (CD-L1, `pdx check --design`).',
        explanation: 'A fix made in one copy does not reach the others.',
        fix: 'Move it into one module the pages import, so a fix lands once.',
        reproducedIn: 'packages/cli/tests/check-command.test.ts',
    },
    PDX_SHARED_LOADING: {
        severity: 'warn', category: 'design',
        summary: 'The same endpoint loaded by a route and by a route inside it (CD-D1, a heuristic, `pdx check --design`).',
        explanation: 'Two requests, and two copies of the data that can disagree.',
        fix: 'Load it once, at the outer route, and hand it down.',
        reproducedIn: 'packages/cli/tests/check-command.test.ts',
    },
};
