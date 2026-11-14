### `<pdx-scheduler>`

A calendar of events in time, by day and by resource: a day, a week or a run of days on a grid of
time slots, with an all-day row, the current time and the working hours marked. Each resource
(a room, a technician) can have its own columns. The grid is a WAI-ARIA grid: one tab stop, the
arrows from slot to slot, Enter into a slot's events and Escape back out, PageUp and PageDown
through periods. A click or Enter on an event emits `event-open`; on an empty slot, `slot-open`.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `events` | — | SchedulerEvent[] | `[]` | The events. A start or end with an offset or `Z` is an instant; without one, a wall time in `time-zone`; a date alone, all day. |
| `resources` | — | SchedulerResource[] | `[]` | The resources, each with its own columns; children are drawn as their leaves. Empty: one column per day. |
| `views` | — | ('day' \| 'week' \| 'days')[] | `['day', 'week', 'days']` | The views the bar offers, in order; one or none hides the switcher. |
| `days` | `days` | number | `3` | How many days the `days` view shows. |
| `groupBy` | `groupby` | 'resource' \| 'date' | `'resource'` | With resources: each resource's days together (`resource`) or each day's resources (`date`). |
| `weekends` | `weekends` | boolean | `true` | Show Saturday and Sunday in the day columns. |
| `firstDay` | `firstday` | number | `-1` | The first day of the week, 0 = Sunday … 6 = Saturday; -1: the locale's. |
| `startHour` | `starthour` | string | `'00:00'` | The first visible hour, `HH:mm`. |
| `endHour` | `endhour` | string | `'24:00'` | The end of the visible hours, `HH:mm`, up to `24:00`. |
| `scrollTo` | `scrollto` | string | `'08:00'` | The hour the grid opens scrolled to. |
| `slotMinutes` | `slotminutes` | number | `30` | The length of a slot, in minutes. |
| `businessHours` | — | BusinessHours | `{ 1: { start: '09:00', end: '18:00' }, 2: { start: '09:00', end: '18:00' }, 3: { start: '09:00', end: '18:00' }, 4: { start: '09:00', end: '18:00' }, 5: { start: '09:00', end: '18:00' } }` | The working hours per weekday, shaded outside; a resource's own `businessHours` win in its columns. |
| `nowIndicator` | `nowindicator` | boolean | `true` | Draw a line at the current time. |
| `timeZone` | `timezone` | string | `''` | The IANA time zone events are shown in. Empty: the browser's. |
| `locale` | `locale` | string | `''` | Locale for dates and times. Empty: the page's language (`lang`), then the browser's. |
| `label` | `label` | string | `''` | The scheduler's accessible name. Empty: «Scheduler». |
| `disabled` | `disabled` | boolean | `false` | Disables interaction and dims the control. |
| `view` | `view` | 'day' \| 'week' \| 'days' | `'week'` | The view on screen. |
| `date` | `date` | string | `''` | The reference date (ISO). Empty: today. |

**Events:** `date-change` → `detail: { value: string }` — Fired when the component writes `date`. Does not bubble.; `event-open` → `detail: { event: SchedulerEvent }` — An event was clicked, or Enter pressed on it.; `period-change` → `detail: { view: 'day' | 'week' | 'days'; start: string; end: string }` — The period on screen changed, by the bar or the keyboard.; `slot-open` → `detail: { start: string; end: string; resource: string | null; allDay: boolean }` — An empty slot was clicked, or Enter pressed on it: its start and end (ISO, UTC), its resource, and whether it is the all-day cell.; `view-change` → `detail: { value: 'day' | 'week' | 'days' }` — Fired when the component writes `view`. Does not bubble.

**Renders:** roles `columnheader` · `grid` · `gridcell` · `group` · `row` · `rowheader` · `toolbar`

**Slot:** `event` — What an event draws; without it, its time and title.

**States:** `:state(disabled)` — `disabled` is set.

**Parts:** `[data-part="root"]` — The scheduler, a `role="group"` named by `label`.; `[data-part="toolbar"]` — The bar above the grid: previous, today, next, the period and the views.; `[data-part="prev"]` — The button to the previous period.; `[data-part="todayButton"]` — The button back to today.; `[data-part="next"]` — The button to the next period.; `[data-part="period"]` — The period on screen, which names the grid.; `[data-part="viewSwitcher"]` — The view buttons, shown when `views` offers more than one.; `[data-part="grid"]` — The `role="grid"` of slots.; `[data-part="columnHeader"]` — A day's or a resource's header.; `[data-part="allDayRow"]` — The row of all-day events.; `[data-part="slot"]` — A cell: a time slot of a day and resource, or its all-day cell.; `[data-part="event"]` — An event; `[data-before]` / `[data-after]` mark one that goes on past the piece shown.; `[data-part="nowLine"]` — The line at the current time.

**Shapes:** `SchedulerEvent { id: string; title: string; start: string; end: string; allDay?: boolean; resource?: string | string[]; color?: string; readonly?: boolean }` · `SchedulerResource { id: string; label: string; color?: string; children?: SchedulerResource[]; readonly?: boolean; businessHours?: BusinessHours }`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**A week** — Events from an array: a start with a time is a timed event, a date alone is all day. Overlapping events share their day, and the line marks the current time. Click an event or an empty slot, or focus the grid and press Enter: the scheduler says which with `event-open` and `slot-open`. _(from the live demo)_

```html
<pdx-scheduler label="Team calendar" :events="events" first-day="1" scroll-to="08:00" @event-open="onEvent" @slot-open="onSlot"></pdx-scheduler>
<p class="pdx-txt-small pdx-ink-muted">{{ last }}</p>
```

**By resource** — Give it `resources` and each one gets its own columns: an event goes where its `resource` says, and one that names two shows in both. A resource's `color` tints its events, and its own `businessHours` shade its columns. `group-by="date"` puts each day's resources together instead. _(from the live demo)_

```html
<pdx-scheduler label="Rooms" view="day" :date="today" :resources="rooms" :events="bookings" :views="['day', 'week']" scroll-to="08:00"></pdx-scheduler>
```

**What an event draws** — The `event` snippet draws an event's content; the scheduler keeps its place, its size and its accessible name. Without the snippet an event shows its time and title. _(from the live demo)_

```html
<pdx-scheduler label="Clinic" view="days" :days="3" :date="start" :events="visits" start-hour="08:00" end-hour="18:00" scroll-to="08:00">
  @snippet event(e) {
    <strong>{{ e.title }}</strong>
    <span class="pdx-ink-muted">{{ e.patient }} · {{ e.reason }}</span>
  }
</pdx-scheduler>
```

**Working week and hours** — Without `weekends` the week is Monday to Friday. `start-hour` and `end-hour` bound the visible day, `slot-minutes` sets the grid's step, and `business-hours` shades the time outside work. `time-zone` shows the events in an IANA zone: a start with an offset is an instant, placed at its time there. _(from the live demo)_

```html
<pdx-scheduler label="Support rota" :weekends="false" first-day="1" start-hour="07:00" end-hour="19:00" slot-minutes="15" time-zone="America/New_York" :business-hours="hours" :events="shifts"></pdx-scheduler>
```

