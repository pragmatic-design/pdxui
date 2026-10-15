/**
 * MANIFEST — pdx-relative-time
 *
 * Contracts written by inspecting the source (packages/ui/src/relative-time/pdx-relative-time.ts)
 * and the CSS (packages/design/src/components/relative-time.css).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TIME DETERMINISM — the key point of this component
 * ─────────────────────────────────────────────────────────────────────────────
 * The text is computed by `getRelativeTime(date, ...)` as
 *   diff = date.getTime() - Date.now()
 * and then formatted with Intl.RelativeTimeFormat. So it DEPENDS ON Date.now():
 * the same `datetime` gives different text depending on when the test runs
 * (snapshots and contracts are NOT deterministic when the date is "close" to now).
 *
 * How determinism is guaranteed:
 *
 *  1) A FIXED DATE, FAR IN THE PAST — `datetime="2020-01-01T00:00:00Z"`.
 *     At about 6 years away the unit chosen is 'year' and the value is rounded
 *     (`Math.round(diff/31_536_000_000)`). With numeric="auto" the text is stable
 *     in the form "N years ago" ("6 years ago", say). The minute-to-minute DRIFT is
 *     IRRELEVANT: it takes ~6 months for the rounded year to change by 1. So the
 *     text does NOT change between the start and the end of a test run.
 *     → No "close" date (seconds, minutes, hours): it would change every second.
 *
 *  2) THE TIMER IS OFF — `update-interval="0"`. The setup calls setupTimer() which,
 *     when intervalMs > 0 (60000 by default), installs a setInterval that re-renders.
 *     With 0 the timer does NOT start (see `if (intervalMs > 0)`), which removes every
 *     asynchronous re-render during the measurement: the screenshot and axe see a stable DOM.
 *
 *  3) AN EXPLICIT LOCALE — `locale="en"`. Intl.RelativeTimeFormat with no locale uses the
 *     system's (which varies between machines, CI and Docker). Pinning it makes the TEXT
 *     identical everywhere ("6 years ago"), which the visual baseline needs.
 *
 * The computation is content-driven anyway: the exact number of years is NEVER asserted
 * (it depends on the current year), and neither is any text string — the contract type
 * system does not measure textContent. Only geometric and style invariants are asserted.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DOM structure (host vs inner)
 * ─────────────────────────────────────────────────────────────────────────────
 *   <pdx-relative-time>                       ← HOST: CSS `display: inline`
 *     <span class="pdx-rt-root" title="...">  ← INNER, created in an rAF and appended to the host
 *         6 years ago                          ← textContent (relative, content-driven)
 *
 * The render is `html``` (empty): the `<span>` is built IMPERATIVELY inside
 * `ctx.track()`, in a requestAnimationFrame. So:
 *   - the measurable element is the inner `.pdx-rt-root` (NOT the host).
 *   - the rAF must be awaited: the runners already waitForTimeout after the goto, but the
 *     selector points at the inner span, which exists only after the first frame.
 * CSS: host `display: inline`; `.pdx-rt-root` `display: inline; cursor: default;`.
 *
 * Being `display: inline`, its getBoundingClientRect depends on the host's line-height
 * (content-driven) → isolation with skipHeight: true. There is no border and no
 * radius in the CSS (inline text) → no assertion on the border or the radius.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * a11y
 * ─────────────────────────────────────────────────────────────────────────────
 * The scenario pins locale="en" → readable English text; showTooltip=true
 * (the default) sets a `title` with the full absolute date (Intl.DateTimeFormat
 * dateStyle:'full'). A `title` is a valid accessible name for a <span> with
 * text content. No disableRule is needed (static text, no interactive
 * control). See the BUG NOTE below: the component is not semantically a <time>.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A NOTE — a REAL a11y bug or limitation (NOT fixed, only written down)
 * ─────────────────────────────────────────────────────────────────────────────
 * The source's header comment and the brief speak of a <time> element
 * with a `datetime` attribute. The source, instead, renders a `<span class="pdx-rt-root">`
 * (packages/ui/src/relative-time/pdx-relative-time.ts:120-121) — NOT a `<time
 * datetime="...">`. Conseguenze:
 *   - the machine-readable `datetime` on a semantic <time> element is missing;
 *   - the relative text ("6 years ago") changes with time and is NOT exposed in an
 *     absolute, parsable form in the markup (only as a `title`, which assistive technology often does not read
 *     by default).
 * The standard HTML pattern would be `<time datetime="2020-01-01T00:00:00Z">6 years
 * ago</time>`. The suggested fix (NOT applied here — the task is the manifest alone):
 *   pdx-relative-time.ts:120  document.createElement('span')  → 'time'
 *   pdx-relative-time.ts:84   after textContent, also set
 *                             spanEl.setAttribute('datetime', date.toISOString()).
 * This is NOT an axe-core failure (a <span> with a title passes WCAG), so the
 * a11y dimension stays green; it is recorded as semantic debt, not as a blocking bug
 * in the manifest.
 */
import type { ComponentManifest } from './_types';

export const relativeTime: ComponentManifest = {
    name: 'relative-time',
    tag: 'pdx-relative-time',
    tier: '5B',
    status: 'wip',
    imports: ['@pdxui/ui/relative-time'],

    // ── Scenarios ──
    scenarios: [
        {
            id: 'relative-time-past',
            title: 'Relative Time — fixed far-past datetime (deterministic "N years ago")',
            // DETERMINISM: a fixed, distant date (2020) + a fixed locale (en) + the timer OFF (update-interval=0).
            // → stable text "6 years ago", the title is the absolute date, and there is no asynchronous re-render.
            html: `
                <div style="max-width: 320px; font-size: 16px; line-height: 1.5;">
                    Last seen
                    <pdx-relative-time
                        data-test="rt"
                        datetime="2020-01-01T00:00:00Z"
                        locale="en"
                        update-interval="0"></pdx-relative-time>
                </div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, every theme) ──
    // The inner <span> exists only after the setup's rAF; the runners wait after the goto.
    contracts: {
        scenarios: {
            'relative-time-past': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="rt"] .pdx-rt-root',
                        description: 'relative-time renders inline text (display: inline)',
                        display: { op: 'is', value: 'inline' },
                    },
                    {
                        // Content-driven: the text "6 years ago" takes a width > 0.
                        selector: 'section:not([hidden]) [data-test="rt"] .pdx-rt-root',
                        description: 'relative-time has rendered text (visible width)',
                        width: { op: '>', value: 0 },
                    },
                    {
                        // An inline box: its height follows the line-height → > 0 (no zero height).
                        selector: 'section:not([hidden]) [data-test="rt"] .pdx-rt-root',
                        description: 'relative-time has a non-zero line box (text is laid out)',
                        height: { op: '>', value: 0 },
                    },
                    {
                        // A style invariant from the CSS (.pdx-rt-root { cursor: default }): it is not clickable.
                        selector: 'section:not([hidden]) [data-test="rt"] .pdx-rt-root',
                        description: 'relative-time uses default cursor (non-interactive text)',
                        cursor: { op: 'is', value: 'default' },
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    // A <span> with text plus a title (the absolute date). Static text, no interactive control.
    // No disableRules. (The <time datetime> semantic debt is written down in the header.)
    a11y: {
        scenarios: ['relative-time-past'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'relative-time-past',
        targets: [
            // Content-driven inline text (height = the host line-height, width = the text):
            // skip the height (it is not a structural invariant). There is no border or radius to assert.
            { selector: 'section:not([hidden]) [data-test="rt"] .pdx-rt-root', tolerancePx: 12, skipHeight: true },
        ],
    },

    // ── Dim. 4: keyboard ──
    // Display-only text, not focusable and not interactive → pattern 'none'.
    keyboard: {
        scenario: 'relative-time-past',
    },

    // ── Dim. 5: visual regression (Docker) ──
    // Safe thanks to the determinism: a fixed 2020 date + the "en" locale + the timer OFF
    // → "N years ago", stable for the whole run. NO mask is needed
    //   (the text is neither random nor blinking; it would change only months from now, well
    //   beyond a run, and then the baseline would be regenerated deliberately).
    visual: {
        scenarios: ['relative-time-past'],
    },
};

export default relativeTime;
