/**
 * MANIFEST — pdx-scheduler (#1020, part 3: the time grid)
 *
 * Derived from:
 *  - source: packages/ui/src/scheduler/pdx-scheduler.pdx
 *      the HOST <pdx-scheduler> :state(disabled) → an inner
 *        <div class="pdx-scheduler" data-part="root" role="group" aria-label>
 *          <div data-part="toolbar" role="toolbar"> prev · today · next · <h2 data-part="period"> · views
 *          <div data-part="grid" role="grid" aria-labelledby="<period>"> one CSS grid; rows are display: contents
 *            header row(s): <div role="columnheader" data-part="columnHeader"> per day (and per resource)
 *            <div role="row" data-part="allDayRow"> → <div role="gridcell" data-part="slot" data-row="0" data-col>
 *            a row per slot → <div role="gridcell" data-part="slot" data-row data-col [data-off] [data-hour]>
 *              <button data-part="event" data-id> placed from the cell it starts in
 *  - CSS: packages/design/src/components/scheduler.css
 *
 * The date, the zone and the locale are fixed and the now line is off, so the grid is the same every day.
 * Keyboard: the grid is one tab stop (roving tabindex on the cells), the arrows walk the cells.
 * Conservative rules: only invariants true on all themes, no exact px.
 */
import type { ComponentManifest } from './_types';

// The week of Monday 16 November 2026, in Rome. Two events overlap on Tuesday; one is all day.
const EVENTS = `[{"id":"standup","title":"Stand-up","start":"2026-11-16T09:00","end":"2026-11-16T09:30"},{"id":"review","title":"Review","start":"2026-11-17T10:00","end":"2026-11-17T12:00"},{"id":"call","title":"Call","start":"2026-11-17T11:00","end":"2026-11-17T12:00"},{"id":"offsite","title":"Offsite","start":"2026-11-18","end":"2026-11-20"}]`;
const ROOMS = `[{"id":"a","label":"Room A"},{"id":"b","label":"Room B"}]`;
const ROOM_EVENTS = `[{"id":"a1","title":"Interview","start":"2026-11-17T09:00","end":"2026-11-17T10:00","resource":"a"},{"id":"b1","title":"Workshop","start":"2026-11-17T09:00","end":"2026-11-17T11:00","resource":"b"}]`;
const FIXED = `date="2026-11-16" time-zone="Europe/Rome" locale="en-US" start-hour="08:00" end-hour="18:00" now-indicator="false"`;

export const scheduler: ComponentManifest = {
    name: 'scheduler',
    tag: 'pdx-scheduler',
    tier: '3C',
    status: 'wip',
    imports: ['@pdxui/ui/scheduler'],

    scenarios: [
        {
            id: 'scheduler-week',
            title: 'Scheduler — A week',
            html: `<pdx-scheduler data-test="scheduler" label="Team" view="week" first-day="1" ${FIXED} events='${EVENTS}'></pdx-scheduler>`,
        },
        {
            id: 'scheduler-resources',
            title: 'Scheduler — A day by room',
            html: `<pdx-scheduler data-test="scheduler" label="Rooms" view="day" date="2026-11-17" time-zone="Europe/Rome" locale="en-US" start-hour="08:00" end-hour="18:00" now-indicator="false" resources='${ROOMS}' events='${ROOM_EVENTS}'></pdx-scheduler>`,
        },
        {
            id: 'scheduler-disabled',
            title: 'Scheduler — Disabled',
            html: `<pdx-scheduler data-test="scheduler" label="Team" view="week" disabled ${FIXED} events='${EVENTS}'></pdx-scheduler>`,
        },
    ],

    contracts: {
        scenarios: {
            'scheduler-week': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="scheduler"] [data-part="grid"]',
                        description: 'the grid is one CSS grid',
                        display: { op: 'is', value: 'grid' },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="scheduler"] [data-id="standup"]',
                        description: 'a half-hour event is tall enough to read a line (>= 16px)',
                        height: { op: '>=', value: 16 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="scheduler"] [data-part="root"]',
                        description: 'an enabled scheduler is opaque',
                        opacity: { op: '==', value: 1, tolerance: 0.01 },
                    },
                ],
                composition: [
                    {
                        // Review (10–12) and Call (11–12) overlap on Tuesday: side by side, half the column each.
                        description: 'overlapping events share their day column',
                        parent: 'body',
                        children: {
                            review: '[data-test="scheduler"] [data-id="review"]',
                            call: '[data-test="scheduler"] [data-id="call"]',
                            standup: '[data-test="scheduler"] [data-id="standup"]',
                            tuesday: '[data-test="scheduler"] [data-row="1"][data-col="1"]',
                        },
                        relations: [
                            { description: 'Review is left of Call', left: 'review.right', op: '<=', right: 'call.left' },
                            { description: 'a two-hour event is taller than a half-hour one', left: 'review.height', op: '>', right: 'standup.height' },
                            { description: 'two overlapping events fit in one day column', left: 'call.right', op: '<=', right: 'tuesday.right', tolerance: 1 },
                            { description: 'Call starts lower than Review: an hour later', left: 'call.top', op: '>', right: 'review.top' },
                        ],
                    },
                ],
            },
            'scheduler-resources': {
                composition: [
                    {
                        description: 'each room has its own column',
                        parent: 'body',
                        children: {
                            a: '[data-test="scheduler"] [data-id="a1"]',
                            b: '[data-test="scheduler"] [data-id="b1"]',
                        },
                        relations: [
                            { description: 'Room A\'s event is left of Room B\'s', left: 'a.right', op: '<=', right: 'b.left' },
                            { description: 'both start at nine: the same top', left: 'a.top', op: '==', right: 'b.top', tolerance: 1 },
                        ],
                    },
                ],
            },
            'scheduler-disabled': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="scheduler"] [data-part="root"]',
                        description: 'a disabled scheduler has reduced opacity',
                        opacity: { op: '<', value: 1 },
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ── the grid pattern: columnheaders, rowheaders, gridcells, named events.
    a11y: {
        scenarios: ['scheduler-week', 'scheduler-resources'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'scheduler-week',
        targets: [
            { selector: 'section:not([hidden]) [data-test="scheduler"] [data-id="review"]', tolerancePx: 12 },
        ],
    },

    // ── Dim. 4: keyboard ── the bar's six buttons, then the grid's one tab stop; the arrows walk the cells.
    keyboard: {
        scenario: 'scheduler-week',
        steps: [
            { key: 'Tab', expectFocus: '[data-test="scheduler"] [data-part="prev"]' },
            { key: 'Tab', expectFocus: '[data-test="scheduler"] [data-part="todayButton"]' },
            { key: 'Tab', expectFocus: '[data-test="scheduler"] [data-part="next"]' },
            { key: 'Tab', expectFocus: '[data-test="scheduler"] [data-part="viewSwitcher"] button:nth-child(1)' },
            { key: 'Tab', expectFocus: '[data-test="scheduler"] [data-part="viewSwitcher"] button:nth-child(2)' },
            { key: 'Tab', expectFocus: '[data-test="scheduler"] [data-part="viewSwitcher"] button:nth-child(3)' },
            { key: 'Tab', expectFocus: '[data-test="scheduler"] [data-row="1"][data-col="0"]' },
            { key: 'ArrowRight', expectFocus: '[data-test="scheduler"] [data-row="1"][data-col="1"]' },
            { key: 'ArrowDown', expectFocus: '[data-test="scheduler"] [data-row="2"][data-col="1"]' },
            { key: 'ArrowUp', expectFocus: '[data-test="scheduler"] [data-row="1"][data-col="1"]' },
            { key: 'ArrowUp', expectFocus: '[data-test="scheduler"] [data-row="0"][data-col="1"]' },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['scheduler-week'],
    },
};

export default scheduler;
