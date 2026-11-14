/**
 * MANIFEST — pdx-scheduler (#1020, part 3: the time grid; part 4: month, year, agenda)
 *
 * Derived from:
 *  - source: packages/ui/src/scheduler/pdx-scheduler.pdx
 *      the HOST <pdx-scheduler> :state(disabled) → an inner
 *        <div class="pdx-scheduler" data-part="root" role="group" aria-label>
 *          <div data-part="toolbar" role="toolbar"> prev · today · next · <div data-part="period"> · views
 *          day / week / days:
 *          <div data-part="grid" role="grid" aria-labelledby="<period>"> one CSS grid; rows are display: contents
 *            header row(s): <div role="columnheader" data-part="columnHeader"> per day (and per resource)
 *            <div role="row" data-part="allDayRow"> → <div role="gridcell" data-part="slot" data-row="0" data-col>
 *            a row per slot → <div role="gridcell" data-part="slot" data-row data-col [data-off] [data-hour]>
 *              <button data-part="event" data-id> placed from the cell it starts in
 *          month: <div data-part="grid" role="grid"> a weekday header row, a row per week of
 *            <div role="gridcell" data-part="slot" data-row data-col [data-outside] [data-today]> →
 *              <button data-part="event" [data-line]> in lanes · <button data-part="more" data-date> «+N»
 *          year: twelve <div data-part="yearMonth" role="grid"> of <div role="gridcell" data-date [data-events]>
 *          agenda: <div data-part="agendaList"> → a date and a <ul> of <button data-part="event"> per day
 *  - CSS: packages/design/src/components/scheduler.css
 *
 * The date, the zone and the locale are fixed and the now line is off, so the grid is the same every day.
 * Keyboard: the grid is one tab stop (roving tabindex on the cells), the arrows walk the cells.
 * Conservative rules: only invariants true on all themes, no exact px.
 */
import type { ComponentManifest } from './_types';

// The week of Monday 21 September 2026, in Rome, all of it in summer time. Past, so never today:
// a scenario holding today would mark it, and its baseline would change with the date. Two events overlap on Tuesday; one is all day.
const EVENTS = `[{"id":"standup","title":"Stand-up","start":"2026-09-21T09:00","end":"2026-09-21T09:30"},{"id":"review","title":"Review","start":"2026-09-22T10:00","end":"2026-09-22T12:00"},{"id":"call","title":"Call","start":"2026-09-22T11:00","end":"2026-09-22T12:00"},{"id":"offsite","title":"Offsite","start":"2026-09-23","end":"2026-09-25"}]`;
const ROOMS = `[{"id":"a","label":"Room A"},{"id":"b","label":"Room B"}]`;
const ROOM_EVENTS = `[{"id":"a1","title":"Interview","start":"2026-09-22T09:00","end":"2026-09-22T10:00","resource":"a"},{"id":"b1","title":"Workshop","start":"2026-09-22T09:00","end":"2026-09-22T11:00","resource":"b"}]`;
const FIXED = `date="2026-09-21" time-zone="Europe/Rome" locale="en-US" start-hour="08:00" end-hour="18:00" now-indicator="false"`;
// September 2026: a trip over a weekend into the next week, a busy Thursday (four events, two shown and
// «+2»), a call on Tuesday.
const MONTH_EVENTS = `[{"id":"trip","title":"Trip","start":"2026-09-25","end":"2026-09-30"},{"id":"call","title":"Call","start":"2026-09-22T10:30","end":"2026-09-22T11:00"},{"id":"t1","title":"One","start":"2026-09-24T09:00","end":"2026-09-24T10:00"},{"id":"t2","title":"Two","start":"2026-09-24T11:00","end":"2026-09-24T12:00"},{"id":"t3","title":"Three","start":"2026-09-24T14:00","end":"2026-09-24T15:00"},{"id":"t4","title":"Four","start":"2026-09-24T16:00","end":"2026-09-24T17:00"}]`;
const CALENDAR = `date="2026-09-22" first-day="1" time-zone="Europe/Rome" locale="en-US" now-indicator="false"`;

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
            html: `<pdx-scheduler data-test="scheduler" label="Rooms" view="day" date="2026-09-22" time-zone="Europe/Rome" locale="en-US" start-hour="08:00" end-hour="18:00" now-indicator="false" resources='${ROOMS}' events='${ROOM_EVENTS}'></pdx-scheduler>`,
        },
        {
            id: 'scheduler-disabled',
            title: 'Scheduler — Disabled',
            html: `<pdx-scheduler data-test="scheduler" label="Team" view="week" disabled ${FIXED} events='${EVENTS}'></pdx-scheduler>`,
        },
        {
            id: 'scheduler-month',
            title: 'Scheduler — A month',
            html: `<pdx-scheduler data-test="scheduler" label="Team" view="month" day-max-events="2" ${CALENDAR} events='${MONTH_EVENTS}'></pdx-scheduler>`,
        },
        {
            id: 'scheduler-year',
            title: 'Scheduler — A year',
            html: `<pdx-scheduler data-test="scheduler" label="Team" view="year" ${CALENDAR} events='${MONTH_EVENTS}'></pdx-scheduler>`,
        },
        {
            id: 'scheduler-agenda',
            title: 'Scheduler — An agenda',
            html: `<pdx-scheduler data-test="scheduler" label="Team" view="agenda" ${CALENDAR} events='${MONTH_EVENTS}'></pdx-scheduler>`,
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
            'scheduler-month': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="scheduler"] [data-part="grid"]',
                        description: 'the month is one CSS grid',
                        display: { op: 'is', value: 'grid' },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="scheduler"] [data-part="more"]',
                        description: 'the «+N» of a full day is tall enough to read and hit (>= 12px)',
                        height: { op: '>=', value: 12 },
                    },
                ],
                composition: [
                    {
                        // The week of 21 September is row 3 (from 31 August); Tuesday is column 1, Thursday 3, Friday 4, Sunday 6.
                        description: 'a multi-day event is one bar over its days; a timed one stays in its day',
                        parent: 'body',
                        children: {
                            trip: 'section:not([hidden]) [data-test="scheduler"] [data-row="3"][data-col="4"] [data-id="trip"]',
                            friday: 'section:not([hidden]) [data-test="scheduler"] [data-row="3"][data-col="4"]',
                            sunday: 'section:not([hidden]) [data-test="scheduler"] [data-row="3"][data-col="6"]',
                            call: 'section:not([hidden]) [data-test="scheduler"] [data-id="call"]',
                            tuesday: 'section:not([hidden]) [data-test="scheduler"] [data-row="3"][data-col="1"]',
                            one: 'section:not([hidden]) [data-test="scheduler"] [data-id="t1"]',
                            two: 'section:not([hidden]) [data-test="scheduler"] [data-id="t2"]',
                            thursday: 'section:not([hidden]) [data-test="scheduler"] [data-row="3"][data-col="3"]',
                        },
                        relations: [
                            { description: 'the trip starts in Friday', left: 'trip.left', op: '>=', right: 'friday.left' },
                            { description: 'and runs into Sunday', left: 'trip.right', op: '>', right: 'sunday.left' },
                            { description: 'the call is inside Tuesday', left: 'call.right', op: '<=', right: 'tuesday.right', tolerance: 1 },
                            { description: 'Thursday\'s second event is under its first', left: 'two.top', op: '>=', right: 'one.bottom', tolerance: 1 },
                            { description: 'and both are inside the day', left: 'two.bottom', op: '<=', right: 'thursday.bottom', tolerance: 1 },
                        ],
                    },
                ],
            },
            'scheduler-year': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="scheduler"] [data-part="yearMonth"]',
                        description: 'a month of the year is a grid of seven columns',
                        display: { op: 'is', value: 'grid' },
                    },
                ],
            },
            'scheduler-agenda': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="scheduler"] [data-part="agendaList"] [data-part="event"]',
                        description: 'an agenda event is a full-height row to hit (>= 24px)',
                        height: { op: '>=', value: 24 },
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
        scenarios: ['scheduler-week', 'scheduler-resources', 'scheduler-month', 'scheduler-year', 'scheduler-agenda'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'scheduler-week',
        targets: [
            { selector: 'section:not([hidden]) [data-test="scheduler"] [data-id="review"]', tolerancePx: 12 },
        ],
    },

    // ── Dim. 4: keyboard ── the bar's nine buttons, then the grid's one tab stop; the arrows walk the cells.
    keyboard: {
        scenario: 'scheduler-week',
        steps: [
            { key: 'Tab', expectFocus: '[data-test="scheduler"] [data-part="prev"]' },
            { key: 'Tab', expectFocus: '[data-test="scheduler"] [data-part="todayButton"]' },
            { key: 'Tab', expectFocus: '[data-test="scheduler"] [data-part="next"]' },
            { key: 'Tab', expectFocus: '[data-test="scheduler"] [data-part="viewSwitcher"] button:nth-child(1)' },
            { key: 'Tab', expectFocus: '[data-test="scheduler"] [data-part="viewSwitcher"] button:nth-child(2)' },
            { key: 'Tab', expectFocus: '[data-test="scheduler"] [data-part="viewSwitcher"] button:nth-child(3)' },
            { key: 'Tab', expectFocus: '[data-test="scheduler"] [data-part="viewSwitcher"] button:nth-child(4)' },
            { key: 'Tab', expectFocus: '[data-test="scheduler"] [data-part="viewSwitcher"] button:nth-child(5)' },
            { key: 'Tab', expectFocus: '[data-test="scheduler"] [data-part="viewSwitcher"] button:nth-child(6)' },
            { key: 'Tab', expectFocus: '[data-test="scheduler"] [data-row="1"][data-col="0"]' },
            { key: 'ArrowRight', expectFocus: '[data-test="scheduler"] [data-row="1"][data-col="1"]' },
            { key: 'ArrowDown', expectFocus: '[data-test="scheduler"] [data-row="2"][data-col="1"]' },
            { key: 'ArrowUp', expectFocus: '[data-test="scheduler"] [data-row="1"][data-col="1"]' },
            { key: 'ArrowUp', expectFocus: '[data-test="scheduler"] [data-row="0"][data-col="1"]' },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['scheduler-week', 'scheduler-month'],
    },
};

export default scheduler;
