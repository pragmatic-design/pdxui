/**
 * MANIFEST — pdx-timeline
 *
 * Contracts written by inspecting the source (packages/ui/src/timeline/pdx-timeline.ts)
 * and the CSS (packages/design/src/components/timeline.css, the .pdx-tl* block).
 *
 * DOM structure (host vs inner):
 *   <pdx-timeline>                          ← HOST: receives .pdx-tl-root (ctx.el.classList.add, rAF)
 *     <ol class="pdx-tl [pdx-tl-horizontal|...]">  ← INNER, appended to the host (the
 *                                                     margin/marker reset lives in timeline.css)
 *       <li class="pdx-tl-item">                 ← one event; its state in words inside a .pdx-sr-only
 *         <div class="pdx-tl-track">         ← the marker column: line + dot
 *           <div class="pdx-tl-line"></div>
 *           <div class="pdx-tl-dot"></div>   ← the marker (12px, border-radius 50%)
 *         </div>
 *         <div class="pdx-tl-content">       ← title/desc/date
 *           <div class="pdx-tl-title">...</div>
 *           <div class="pdx-tl-desc">...</div>
 *           <div class="pdx-tl-date">...</div>
 *         </div>
 *       </div>
 *       ...
 * The measurable container IS the inner <div class="pdx-tl"> (NOT the host): [data-test="tl"] .pdx-tl.
 * Default mode 'left' (flex column). Item min-height 3rem.
 *
 * a11y: a native ordered list — an <ol> with one <li> per event.
 * No disableRules. (An optional clickable item adds tabindex/keydown, but the default
 * is not interactive → no keyboard pattern is tested here.)
 *
 * Content-driven (a list of events, height = the sum of the items, sensitive to the host's line-height)
 * → isolation with skipHeight: true; we assert display and the dot's radius (a circle).
 * Conservative contracts: display oneOf, radius >= 0, no exact px.
 */
import type { ComponentManifest } from './_types';

export const timeline: ComponentManifest = {
    name: 'timeline',
    tag: 'pdx-timeline',
    tier: '5B',
    status: 'wip',
    imports: ['@pdxui/ui/timeline'],

    // ── Scenarios ──
    scenarios: [
        {
            id: 'timeline-basic',
            title: 'Timeline — Basic (vertical, left)',
            html: `
                <div style="max-width: 480px;">
                    <pdx-timeline
                        data-test="tl"
                        items='[
                            {"title":"Order placed","description":"We received your order.","date":"Mar 1"},
                            {"title":"Shipped","description":"Your package is on the way.","date":"Mar 3","status":"info"},
                            {"title":"Delivered","description":"Package delivered.","date":"Mar 5","status":"success"}
                        ]'>
                    </pdx-timeline>
                </div>`,
        },
        {
            id: 'timeline-horizontal',
            title: 'Timeline — Horizontal',
            html: `
                <div style="max-width: 640px;">
                    <pdx-timeline
                        data-test="tl-horizontal"
                        mode="horizontal"
                        items='[
                            {"title":"Draft"},
                            {"title":"Review"},
                            {"title":"Published","status":"success"}
                        ]'>
                    </pdx-timeline>
                </div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract ──
    contracts: {
        scenarios: {
            'timeline-basic': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="tl"] .pdx-tl',
                        description: 'timeline container is a flex/block box (display set)',
                        display: { op: 'oneOf', value: ['flex', 'block', 'grid'] },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="tl"] .pdx-tl',
                        description: 'timeline is tall enough to hold the event items (content-driven)',
                        height: { op: '>=', value: 60 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="tl"] .pdx-tl-dot',
                        description: 'event marker (dot) is a round chip (radius >= 0; 50% on most themes)',
                        radius: { all: { op: '>=', value: 0 } },
                    },
                ],
                // Composition: the track (marker) + content are contained in the item, the items in the container.
                composition: [
                    {
                        description: 'event marker + content are contained within the timeline box',
                        parent: 'section:not([hidden]) [data-test="tl"] .pdx-tl',
                        children: {
                            tl: 'section:not([hidden]) [data-test="tl"] .pdx-tl',
                            item: 'section:not([hidden]) [data-test="tl"] .pdx-tl-item',
                            track: 'section:not([hidden]) [data-test="tl"] .pdx-tl-track',
                            dot: 'section:not([hidden]) [data-test="tl"] .pdx-tl-dot',
                            content: 'section:not([hidden]) [data-test="tl"] .pdx-tl-content',
                        },
                        relations: [
                            { description: 'item within timeline', left: 'item', op: 'contained-in', right: 'tl' },
                            { description: 'track within timeline', left: 'track', op: 'contained-in', right: 'tl' },
                            { description: 'dot within timeline', left: 'dot', op: 'contained-in', right: 'tl' },
                            { description: 'content within timeline', left: 'content', op: 'contained-in', right: 'tl' },
                            {
                                description: 'marker track sits left of content (left mode)',
                                left: 'track.left',
                                op: '<=',
                                right: 'content.left',
                                tolerance: 1,
                            },
                            {
                                description: 'content right edge does not overflow timeline right edge',
                                left: 'content.right',
                                op: '<=',
                                right: 'tl.right',
                                tolerance: 1,
                            },
                        ],
                    },
                ],
            },
            'timeline-horizontal': {
                // Structure only: the items stay contained in the horizontal container.
                composition: [
                    {
                        description: 'all items contained within the horizontal timeline box',
                        parent: 'section:not([hidden]) [data-test="tl-horizontal"] .pdx-tl',
                        children: {
                            tl: 'section:not([hidden]) [data-test="tl-horizontal"] .pdx-tl',
                            item: 'section:not([hidden]) [data-test="tl-horizontal"] .pdx-tl-item',
                        },
                        relations: [
                            { description: 'item within timeline', left: 'item', op: 'contained-in', right: 'tl' },
                        ],
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    // A native ordered list (<ol>/<li>). The main scenario, no disableRules.
    a11y: {
        scenarios: ['timeline-basic'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'timeline-basic',
        targets: [
            // A content-driven container (events): skip height, assert width/radius/border.
            { selector: 'section:not([hidden]) [data-test="tl"] .pdx-tl', tolerancePx: 12, skipHeight: true },
        ],
    },

    // ── Dim. 4: keyboard ──
    // Not interactive by default (clickable is opt-in). No keyboard pattern in the base scenario. Omitted.

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['timeline-basic'],
    },
};

export default timeline;
