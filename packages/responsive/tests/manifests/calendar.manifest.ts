/**
 * MANIFEST — pdx-calendar (standalone ARIA calendar grid, month view + date selection)
 *
 * Contracts DERIVED by inspecting the source (packages/ui/src/calendar/pdx-calendar.ts)
 * and the CSS (packages/design/src/components/calendar.css).
 *
 * ──────────────────────────────────────────────────────────────────────────
 * DETERMINISM OVER TIME (CRITICAL)
 * ──────────────────────────────────────────────────────────────────────────
 * initView() (pdx-calendar.ts:92) reads `ctx.value()`: when it is set → it opens on the month of
 * that value (parseISO(val) → _viewYear/_viewMonth); OTHERWISE it opens on today() = Date.now()
 * → NOT deterministic (the grid would change every day → an unstable visual snapshot).
 *
 * THE FIX: every scenario PINS `value="2024-06-15"`. initView and the sync track (pdx-calendar.ts:108)
 * put the view on June 2024. With `fixedWeeks=true` (the default, prop:47) the grid ALWAYS has
 * 6 weeks × 7 days = 42 cells → a stable layout, independent of the real date.
 * June 2024 starts on a Saturday (the 'en' locale's firstDay is Sunday) → a stable, reproducible grid.
 *
 * WHAT IS LEFT non-deterministic: TODAY's cell gets `.pdx-cal-today` and `aria-current="date"`.
 * If the real date fell in June 2024 (impossible: today is 2026) that cell would be highlighted;
 * with the view pinned in the past, NO cell is "today" → no visual drift. The visual dimension masks
 * the whole cell grid (.pdx-cal-grid) anyway, for total immunity to any time marker.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * DOM STRUCTURE (light DOM, built imperatively in the "structure" track — rAF, ts:392)
 * ──────────────────────────────────────────────────────────────────────────
 *   <pdx-calendar>                                         ← host (render: empty html``)
 *     <div class="pdx-calendar [pdx-calendar-inline] [disabled]"  role="group" aria-label="Calendar">
 *       <div class="pdx-cal-nav">                          ← navigation header (ts:462)
 *         <button class="pdx-cal-nav-btn" aria-label="Previous month">‹</button>   (ts:465)
 *         <button class="pdx-cal-title" aria-live="polite">June 2024</button>      (ts:472) clic → months view
 *         <button class="pdx-cal-nav-btn" aria-label="Next month">›</button>       (ts:487)
 *       <div class="pdx-cal-grids">
 *        <div class="pdx-cal-month">  (one block per month; with more than one, a .pdx-cal-sub-header first)
 *         <div class="pdx-cal-grid" role="grid" aria-label="June 2024">            (ts:524) display:flex column
 *           <div class="pdx-cal-header-row" role="row">                            (ts:530) grid 7col
 *             <div class="pdx-cal-day-header" role="columnheader">Su…Sa</div> ×7   (ts:543)
 *           <div class="pdx-cal-row" role="row"> ×6                                (ts:553) grid 7col
 *             <button class="pdx-cal-cell [pdx-cal-outside|today|selected|disabled|focused]"  (ts:565)
 *                     role="gridcell" tabindex="0|-1"
 *                     aria-selected="true" (the selected one only, ts:448)
 *                     aria-current="date" (today only, ts:576)
 *                     aria-disabled="true" (the disabled ones only, ts:577)
 *                     aria-label="Saturday, June 15, 2024" (the full date)
 *                     data-iso data-outside data-today>NN</button> ×7
 *
 * Note: the grid is NOT a <table>; it is a CSS grid (.pdx-cal-header-row/.pdx-cal-row with
 *   grid-template-columns: repeat(7, 1fr), CSS:110-115). The roles grid/row/columnheader/gridcell
 *   are applied explicitly → a valid ARIA grid structure without a native table.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * a11y (VERIFIED in the source)
 * ──────────────────────────────────────────────────────────────────────────
 *   · the root is role="group" + aria-label="Calendar" (not role="application": that turns browse mode off).
 *   · the grid is role="grid" + aria-label="<Month> <Year>" (ts:526-527).
 *   · rows are role="row"; day headers role="columnheader"; cells role="gridcell".
 *   · the selected cell: aria-selected="true" (updateCellStyles, ts:448).
 *   · today's cell: aria-current="date" (ts:576).
 *   · nav prev/next: aria-label "Previous month"/"Next month" (ts:468,490) → an ACCESSIBLE NAME IS THERE.
 *   · roving tabindex: only the focused cell has tabindex="0", the others "-1" (ts:452,569).
 *   NO a11y BUG found: grid/gridcell/aria-selected are there, and the nav buttons are named.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * KEYBOARD (VERIFIED — onKeydown, ts:313, active in the day view only)
 * ──────────────────────────────────────────────────────────────────────────
 *   ArrowLeft/Right ±1 day; ArrowUp/Down ∓7 days; Home/End the ends of the week;
 *   PageUp/Down ±1 month (Shift ±1 year); Enter/Space selects. Pattern 'roving'.
 *   The keydown listener is on the .pdx-calendar root (ts:401), and the initial focus goes to a gridcell.
 *   ArrowRight moves _focusedDate → the cell one day later becomes tabindex="0" and takes the focus
 *   (the structure is not rebuilt while it stays in the same month; updateCellStyles updates the tabindexes).
 *   In June 2024 the 15th (Saturday) + 1 = the 16th (Sunday), both INSIDE the month → no rebuild,
 *   and the focus moves to the cell data-iso="2024-06-16".
 *
 * ──────────────────────────────────────────────────────────────────────────
 * STATES SET UP FRONT → STANDALONE rules (NOT StateRules)
 * ──────────────────────────────────────────────────────────────────────────
 *   The selection (value), disabled (a prop) and min/max are static props → dedicated scenarios, standalone assertions.
 *
 * CONTRACTS: conservative, no theme-specific px. Invariants that hold on all 13 themes:
 *   · the grid and the rows are CSS grids (display grid) → 7 columns;
 *   · the cells are interactive boxes (cursor pointer) with a non-negative radius;
 *   · the 7 headers and the 7 cells of a row sit INSIDE the grid (containment);
 *   · the selected cell is contained in the grid;
 *   · the nav and the grid are contained in the calendar's container.
 */
import type { ComponentManifest } from './_types';

// Reused selectors (always section-scoped, so only the visible section is measured).
const ROOT = 'section:not([hidden]) [data-test="cal"]';

export const calendar: ComponentManifest = {
    name: 'calendar',
    tag: 'pdx-calendar',
    tier: '3',
    status: 'wip',
    imports: ['@pdxui/ui/calendar'],

    // ── Scenarios (the date ALWAYS fixed at June 2024 → a deterministic grid) ──
    scenarios: [
        {
            id: 'calendar-month',
            title: 'Calendar — June 2024, day 15 selected (inline)',
            // The value pins the month (no Date.now) → 6 stable weeks. `inline` makes the border and box visible.
            html: `
                <pdx-calendar data-test="cal" inline value="2024-06-15"></pdx-calendar>`,
        },
        {
            id: 'calendar-disabled',
            title: 'Calendar — Disabled',
            html: `
                <pdx-calendar data-test="cal" inline disabled value="2024-06-15"></pdx-calendar>`,
        },
        {
            id: 'calendar-minmax',
            title: 'Calendar — June 2024 with min/max bounds',
            // min/max disable the dates outside the range → at least one gridcell with aria-disabled.
            html: `
                <pdx-calendar data-test="cal" inline value="2024-06-15" min="2024-06-10" max="2024-06-20"></pdx-calendar>`,
        },
        {
            id: 'calendar-two-months',
            title: 'Calendar — two months, June and July 2024',
            // One .pdx-cal-month block per month: with each month's title and grid as siblings in the
            // flex row of .pdx-cal-grids, the titles would sit BESIDE the grids.
            html: `
                <pdx-calendar data-test="cal" inline value="2024-06-15" number-of-months="2"></pdx-calendar>`,
        },
        {
            id: 'calendar-two-months-narrow',
            title: 'Calendar — two months in a box narrower than both',
            // Two 260px months side by side need ~540px. On a phone, side by side, the second runs past the
            // edge (right = 619 at 390px), cut off by the page's overflow-x: clip.
            html: `
                <div data-test="cal-box" style="width: 300px;">
                    <pdx-calendar data-test="cal" inline value="2024-06-15" number-of-months="2"></pdx-calendar>
                </div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, every theme) ──
    contracts: {
        scenarios: {
            'calendar-month': {
                standalone: [
                    {
                        // Container visibile (CSS: .pdx-calendar { display: inline-flex }).
                        selector: `${ROOT} .pdx-calendar`,
                        description: 'calendar container is a visible flex box',
                        display: { op: 'isNot', value: 'none' },
                    },
                    {
                        // CSS: .pdx-cal-row { display: grid; grid-template-columns: repeat(7,1fr) }.
                        selector: `${ROOT} .pdx-cal-grid`,
                        description: 'day grid is displayed (not none)',
                        display: { op: 'isNot', value: 'none' },
                    },
                    {
                        // The week row is a CSS grid (7 columns).
                        selector: `${ROOT} .pdx-cal-row`,
                        description: 'a week row is a CSS grid',
                        display: { op: 'is', value: 'grid' },
                    },
                    {
                        // CSS: .pdx-cal-cell { cursor: pointer } → celle interattive.
                        selector: `${ROOT} .pdx-cal-cell`,
                        description: 'day cell is interactive (cursor pointer)',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                    {
                        // The cell is a box of a noticeable size (36×36 in the base CSS; themes may vary
                        // but it stays a clickable square that has not collapsed).
                        selector: `${ROOT} .pdx-cal-cell`,
                        description: 'day cell has an appreciable clickable size',
                        width: { op: '>=', value: 20 },
                        height: { op: '>=', value: 20 },
                    },
                    {
                        // A non-negative radius (metro and cyberpunk zero it, never below 0).
                        selector: `${ROOT} .pdx-cal-cell`,
                        description: 'day cell radius is non-negative',
                        radius: { all: { op: '>=', value: 0 } },
                    },
                ],
                composition: [
                    {
                        // 7 column headers plus the grid: the first and the last header sit INSIDE the grid
                        // (the 7-column grid lines them up on one row). This checks the week's structure.
                        description: 'weekday column headers are contained within the day grid',
                        parent: `${ROOT} .pdx-cal-grid`,
                        children: {
                            grid: `${ROOT} .pdx-cal-grid`,
                            firstHeader: `${ROOT} .pdx-cal-header-row .pdx-cal-day-header:first-child`,
                            lastHeader: `${ROOT} .pdx-cal-header-row .pdx-cal-day-header:last-child`,
                        },
                        relations: [
                            { description: 'first weekday header within grid', left: 'firstHeader', op: 'contained-in', right: 'grid' },
                            { description: 'last weekday header within grid', left: 'lastHeader', op: 'contained-in', right: 'grid' },
                            // 7 columns: the last header is to the right of the first (a horizontal row, not stacked).
                            { description: 'last header is to the right of the first (7-column row)', left: 'firstHeader.right', op: '<=', right: 'lastHeader.right' },
                        ],
                    },
                    {
                        // The 7 days of a week are aligned horizontally: the 1st and the 7th cell of the
                        // first row share the same top (the same row) and their left grows.
                        description: 'the 7 cells of a week row are aligned on one row',
                        parent: `${ROOT} .pdx-cal-row`,
                        children: {
                            row: `${ROOT} .pdx-cal-row`,
                            firstDay: `${ROOT} .pdx-cal-row .pdx-cal-cell:first-child`,
                            lastDay: `${ROOT} .pdx-cal-row .pdx-cal-cell:last-child`,
                        },
                        relations: [
                            { description: 'first day cell within its row', left: 'firstDay', op: 'contained-in', right: 'row' },
                            { description: 'last day cell within its row', left: 'lastDay', op: 'contained-in', right: 'row' },
                            { description: 'cells share the same row top', left: 'firstDay.top', op: '==', right: 'lastDay.top', tolerance: 2 },
                            { description: 'last day is to the right of the first day', left: 'firstDay.left', op: '<', right: 'lastDay.left' },
                        ],
                    },
                    {
                        // The selected cell (value=2024-06-15 → .pdx-cal-selected) sits INSIDE the grid.
                        description: 'the selected day cell is contained within the day grid',
                        parent: `${ROOT} .pdx-cal-grid`,
                        children: {
                            grid: `${ROOT} .pdx-cal-grid`,
                            selected: `${ROOT} .pdx-cal-cell.pdx-cal-selected`,
                        },
                        relations: [
                            { description: 'selected cell within grid', left: 'selected', op: 'contained-in', right: 'grid' },
                        ],
                    },
                    {
                        // The nav header and the grid are both contained in the calendar's container.
                        description: 'nav header and grid are contained within the calendar container',
                        parent: `${ROOT} .pdx-calendar`,
                        children: {
                            container: `${ROOT} .pdx-calendar`,
                            nav: `${ROOT} .pdx-cal-nav`,
                            grid: `${ROOT} .pdx-cal-grid`,
                        },
                        relations: [
                            { description: 'nav within container', left: 'nav', op: 'contained-in', right: 'container' },
                            { description: 'grid within container', left: 'grid', op: 'contained-in', right: 'container' },
                            { description: 'nav header is above the grid', left: 'nav.bottom', op: '<=', right: 'grid.top', tolerance: 2 },
                        ],
                    },
                ],
            },

            // Two months: each title sits ABOVE its grid, and the two grids sit side by side.
            'calendar-two-months': {
                composition: [
                    {
                        description: 'each month title sits above its grid, and the two months sit side by side',
                        parent: `${ROOT} .pdx-cal-grids`,
                        children: {
                            title1: `${ROOT} .pdx-cal-month:nth-child(1) .pdx-cal-sub-header`,
                            grid1: `${ROOT} .pdx-cal-month:nth-child(1) .pdx-cal-grid`,
                            title2: `${ROOT} .pdx-cal-month:nth-child(2) .pdx-cal-sub-header`,
                            grid2: `${ROOT} .pdx-cal-month:nth-child(2) .pdx-cal-grid`,
                        },
                        relations: [
                            { description: 'June title bottom <= June grid top', left: 'title1.bottom', op: '<=', right: 'grid1.top', tolerance: 1 },
                            { description: 'July title bottom <= July grid top', left: 'title2.bottom', op: '<=', right: 'grid2.top', tolerance: 1 },
                            { description: 'June grid ends before July grid starts', left: 'grid1.right', op: '<=', right: 'grid2.left', tolerance: 1 },
                            { description: 'the two grids share a top', left: 'grid1.top', op: '==', right: 'grid2.top', tolerance: 2 },
                        ],
                    },
                ],
            },
            // In a box narrower than two months, the second month goes below the first.
            'calendar-two-months-narrow': {
                composition: [
                    {
                        // Numeric edges, not `contained-in`: see pagination-narrow.
                        description: 'narrow box: the months stack and both stay inside the box',
                        parent: 'section:not([hidden]) [data-test="cal-box"]',
                        children: {
                            box: 'section:not([hidden]) [data-test="cal-box"]',
                            grid1: `${ROOT} .pdx-cal-month:nth-child(1) .pdx-cal-grid`,
                            grid2: `${ROOT} .pdx-cal-month:nth-child(2) .pdx-cal-grid`,
                            calendar: `${ROOT} .pdx-calendar`,
                        },
                        relations: [
                            { description: 'the calendar ends inside the box', left: 'calendar.right', op: '<=', right: 'box.right', tolerance: 1 },
                            { description: 'July grid ends inside the box', left: 'grid2.right', op: '<=', right: 'box.right', tolerance: 1 },
                            { description: 'July sits below June', left: 'grid2.top', op: '>=', right: 'grid1.bottom', tolerance: 1 },
                        ],
                    },
                ],
            },

            // Disabled: prop statica → standalone (CSS: .pdx-calendar.disabled { opacity:.5; pointer-events:none }).
            'calendar-disabled': {
                standalone: [
                    {
                        selector: `${ROOT} .pdx-calendar`,
                        description: 'disabled calendar has reduced opacity',
                        opacity: { op: '<', value: 1 },
                    },
                    {
                        selector: `${ROOT} .pdx-calendar`,
                        description: 'disabled calendar disables pointer events',
                        pointerEvents: { op: 'is', value: 'none' },
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    // A valid grid: role=grid/row/columnheader/gridcell. The cells are <button>s with text (an accessible name).
    // The prev/next nav are <button>s with an aria-label ("Previous/Next month") → named. The title button has text.
    // No disableRule: the ARIA structure is complete and there is no known false positive.
    a11y: {
        scenarios: ['calendar-month', 'calendar-two-months'],
    },

    // ── Dim. 3: style isolation ──
    // The inline container (.pdx-calendar.pdx-calendar-inline) must keep its box, border and radius under
    // hostile global CSS. skipHeight: the height is content-driven (6 rows × a cell, plus the header and the
    // nav, sensitive to the host's font and line-height) → not a clean structural invariant; the radius and
    // border (CSS values, not scaled) stay asserted as the real immunity guarantee.
    isolation: {
        scenario: 'calendar-month',
        targets: [
            { selector: `${ROOT} .pdx-calendar`, tolerancePx: 10, skipHeight: true },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA grid — roving tabindex) ──
    // onKeydown (ts:313) on the root: ArrowRight = +1 day → the next cell becomes tabindex=0 and takes
    // the focus. initialFocus is on the selected cell (15 June, tabindex=0). After ArrowRight the focus
    // is on data-iso="2024-06-16". So: expectFocus on the new cell plus expectAttr tabindex="0".
    keyboard: {
        scenario: 'calendar-month',
        initialFocus: `${ROOT} .pdx-cal-cell[data-iso="2024-06-15"]`,
        steps: [
            {
                key: 'ArrowRight',
                expectFocus: `${ROOT} .pdx-cal-cell[data-iso="2024-06-16"]`,
                expectAttr: { selector: `${ROOT} .pdx-cal-cell[data-iso="2024-06-16"]`, name: 'tabindex', value: '0' },
            },
        ],
    },

    // ── Dim. 5: visual regression (Docker) — a fixed month ──
    // mask: the cell grid is masked for total immunity to any leftover time marker
    //   (.pdx-cal-today / aria-current). The date is already pinned to June 2024 (no Date.now), so the
    //   mask is a second guarantee, not the only defence against non-determinism.
    visual: {
        scenarios: ['calendar-month'],
        mask: [`${ROOT} .pdx-cal-grid`],
    },
};

export default calendar;
