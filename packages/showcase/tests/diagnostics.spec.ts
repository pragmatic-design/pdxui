// What a production build says out loud, and what it does not carry.
//
// A diagnostic is written once and paid for by every visitor. The framework's warnings explain what
// the AUTHOR did wrong — a menu item with no type, a grid row with no height, a `<pdx-form>` with
// no form — and none of that can be acted on by someone reading the deployed app. So they sit
// behind `DEV`, a const and not a function: a call the minifier will not inline is a branch it
// cannot fold, and every diagnostic would ship.
//
// `bundle-budget.spec.ts` measures the size. This one measures WHAT is left out, which is the
// half a number cannot say: a build that dropped the warnings by deleting them would satisfy the
// ratchet just as well.
//
// The rule, and the thing to get right when adding a diagnostic:
//
//   · it teaches the author something  → behind `DEV`, and it leaves the production bundle;
//   · it reports a FAILURE at runtime  → it stays. A loader that did not answer, a guard that
//     threw, an unhandled error: that is the app talking about itself, and silencing it in
//     production is how an incident becomes unreadable.
import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'assets');

const bundle = (): string => readdirSync(DIST)
    .filter((f) => f.endsWith('.js'))
    .map((f) => readFileSync(join(DIST, f), 'utf-8'))
    .join('\n');

/** Diagnostics: each teaches the author something, and none of them can help a visitor. */
const TEACHING: [string, string][] = [
    ['autoPageSize: no row rendered', '@pdxui/ui — data-grid/auto-page-size.ts'],
    ['is neither a number nor', '@pdxui/ui — masonry/pdx-masonry.ts'],
    ['options is not an array', '@pdxui/ui — segmented/pdx-segmented.ts'],
    ['is announced "button" alone', '@pdxui/ui — button/pdx-button.ts and toolbar/pdx-toolbar.ts'],
    ['is not a region', '@pdxui/ui — app-layout/pdx-app-layout.ts'],
    ['requires a "form" prop', '@pdxui/ui — form/pdx-form.ts'],
    ['Duplicate key', '@pdxui/core — renderer/list.ts'],
    ['portal: target', '@pdxui/core — renderer/helpers.ts'],
    ['refused to set inline event attribute', '@pdxui/core — renderer/dom.ts'],
    ['form schema: invalid pattern', '@pdxui/core — form/form-schema.ts'],
    ['read outside reactive context', '@pdxui/core — reactivity/signal.ts'],
    ['no element to watch, falling back to the window', '@pdxui/core — browser/scroll.ts'],
];

/** Failures: the app saying something went wrong. Silencing these is how an incident goes dark. */
const REPORTING = [
    'Unhandled',                        // core — component/global-error.ts
    'setup failed',                     // core — component/component.ts
    'Infinite reactive loop detected',   // core — reactivity/signal.ts
    'Loader failed for',                 // router — runtime.ts
];

test('no diagnostic that teaches the author is in the production bundle', () => {
    const js = bundle();
    const shipped = TEACHING.filter(([probe]) => js.includes(probe)).map(([probe, where]) => `${where}: "${probe}"`);
    expect(shipped,
        'these explain a mistake to someone who cannot fix it, and every visitor downloads them: '
        + 'put the call behind `if (DEV)` — see core/src/utils/env.ts').toEqual([]);
});

test('the devtools global, and the agent API behind it, are not in the production bundle', () => {
    // `__PDX_DEVTOOLS__` answers what a component holds, its props, its errors: in development an
    // agent's instrument, in production a fingerprint and a window into the app's state.
    const js = bundle();
    expect(js, 'the devtools global is installed by a production build').not.toContain('__PDX_DEVTOOLS__');
});

test('control — the failures the app reports about itself are still there', () => {
    // Without this, the test above is satisfied by a build that says nothing at all, which is the
    // version where a loader that never answers leaves no trace in a console.
    const js = bundle();
    const missing = REPORTING.filter((probe) => !js.includes(probe));
    expect(missing, 'a runtime failure report was stripped along with the diagnostics').toEqual([]);
});

test('control — the probes match something, so this is not measuring an empty file', () => {
    // Every probe above is a fragment of a real message. If the messages are reworded, the list is
    // silently measuring nothing — so the bundle is asserted to be a bundle, and the reporting
    // probes above are the proof that the probes themselves still find text.
    const js = bundle();
    expect(js.length, 'no JavaScript in dist/assets').toBeGreaterThan(100_000);
    expect(js).toContain('console.');
});
