### `<pdx-scheduler>`

Events in time: day, week, month, year, agenda and timeline views, by resource.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `resources` | — | SchedulerResource[] | `[]` | The resources: each with its own columns in the time grid, where children are drawn as their leaves; each a row of the timeline, children under their parent. Empty: one column per day, one timeline row. |
| `views` | — | ('day' \| 'week' \| 'days' \| 'month' \| 'year' \| 'agenda' \| 'timeline')[] | `['day', 'week', 'days', 'month', 'year', 'agenda', 'timeline']` | The views the bar offers, in order; one or none hides the switcher. |
| `timelineScale` | `timelinescale` | 'day' \| 'week' \| 'month' \| 'year' | `'week'` | The timeline's period and its columns: a day of slots, a week or a month of days, a year of months. |
| `days` | `days` | number | `3` | How many days the `days` view shows. |
| `agendaDays` | `agendadays` | number | `7` | How many days the `agenda` view lists, from the reference date. |
| `dayMaxEvents` | `daymaxevents` | number | `3` | How many events a day of the month shows before its «+N». |
| `groupBy` | `groupby` | 'resource' \| 'date' | `'resource'` | With resources: each resource's days together (`resource`) or each day's resources (`date`). |
| `weekends` | `weekends` | boolean | `true` | Show Saturday and Sunday in the day columns and the month. |
| `firstDay` | `firstday` | number | `-1` | The first day of the week, 0 = Sunday … 6 = Saturday; -1: the locale's. |
| `startHour` | `starthour` | string | `'00:00'` | The first visible hour, `HH:mm`. |
| `endHour` | `endhour` | string | `'24:00'` | The end of the visible hours, `HH:mm`, up to `24:00`. |
| `scrollTo` | `scrollto` | string | `'08:00'` | The hour the time grid opens scrolled to. |
| `slotMinutes` | `slotminutes` | number | `30` | The length of a slot, in minutes. |
| `businessHours` | — | BusinessHours | `{ 1: { start: '09:00', end: '18:00' }, 2: { start: '09:00', end: '18:00' }, 3: { start: '09:00', end: '18:00' }, 4: { start: '09:00', end: '18:00' }, 5: { start: '09:00', end: '18:00' } }` | The working hours per weekday, shaded outside; a resource's own `businessHours` win in its columns. |
| `nowIndicator` | `nowindicator` | boolean | `true` | Draw a line at the current time. |
| `timeZone` | `timezone` | string | `''` | The IANA time zone events are shown in. Empty: the browser's. |
| `locale` | `locale` | string | `''` | Locale for dates and times. Empty: the page's language (`lang`), then the browser's. |
| `label` | `label` | string | `''` | The scheduler's accessible name. Empty: «Scheduler». |
| `disabled` | `disabled` | boolean | `false` | Disables interaction and dims the control. |
| `readonly` | `readonly` | boolean | `false` | No event is moved, resized or created; an event or resource can still allow it for itself. |
| `preventOverlap` | `preventoverlap` | boolean | `false` | Refuse a move, resize or create that would overlap another event of the same resource. |
| `createId` | — | () => string | `() => crypto.randomUUID()` | The id of an event the scheduler creates. |
| `events` | — | SchedulerEvent[] | `[]` | The events. A start or end with an offset or `Z` is an instant; without one, a wall time in `time-zone`; a date alone, all day. Written by the scheduler after a move, resize or create the app allowed. |
| `view` | `view` | 'day' \| 'week' \| 'days' \| 'month' \| 'year' \| 'agenda' \| 'timeline' | `'week'` | The view on screen. |
| `date` | `date` | string | `''` | The reference date (ISO). Empty: today. |

**Events:** `before-create` → `detail: { start: string; end: string; resource: string | null; allDay: boolean; conflicts: SchedulerEvent[] }` — A drag over empty slots is about to create an event there (ISO, UTC); `preventDefault()` refuses it.; `before-move` → `detail: { event: SchedulerEvent; from: { start: string; end: string; resource?: string | string[] }; to: { start: string; end: string; resource?: string | string[] }; conflicts: SchedulerEvent[] }` — An event is about to move, to another time, day or resource; `preventDefault()` refuses it.; `before-resize` → `detail: { event: SchedulerEvent; edge: 'start' | 'end'; from: { start: string; end: string; resource?: string | string[] }; to: { start: string; end: string; resource?: string | string[] }; conflicts: SchedulerEvent[] }` — An event is about to be resized by one edge; `preventDefault()` refuses it.; `create` → `detail: { event: SchedulerEvent }` — An event was created, by a drag over empty slots or a drop from outside, and added to `events`.; `date-change` → `detail: { value: string }` — Fired when the component writes `date`. Does not bubble.; `event-open` → `detail: { event: SchedulerEvent }` — An event was clicked, or Enter pressed on it.; `events-change` → `detail: { value: SchedulerEvent[] }` — Fired when the component writes `events`. Does not bubble.; `external-drop` → `detail: { data: unknown; start: string; end: string; resource: string | null; allDay: boolean; conflicts: SchedulerEvent[] }` — Something the app made draggable with `useDrag` was dropped on the grid: its data and where (ISO, UTC); `preventDefault()` refuses it, else an event is created there from `data.title` and `data.duration` (minutes).; `move` → `detail: { event: SchedulerEvent; from: { start: string; end: string; resource?: string | string[] }; to: { start: string; end: string; resource?: string | string[] }; conflicts: SchedulerEvent[] }` — An event moved; `events` is already written.; `period-change` → `detail: { view: 'day' | 'week' | 'days' | 'month' | 'year' | 'agenda' | 'timeline'; start: string; end: string }` — The period on screen changed, by the bar, the keyboard, or a day opened from the month or the year.; `rejected` → `detail: { action: 'move' | 'resize' | 'create'; event: SchedulerEvent | null; to: { start: string; end: string; resource?: string | string[] }; reason: 'overlap' | 'prevented'; conflicts: SchedulerEvent[] }` — A move, resize or create was refused: by `prevent-overlap` (`overlap`) or by the app (`prevented`).; `resize` → `detail: { event: SchedulerEvent; edge: 'start' | 'end'; from: { start: string; end: string; resource?: string | string[] }; to: { start: string; end: string; resource?: string | string[] }; conflicts: SchedulerEvent[] }` — An event was resized; `events` is already written.; `slot-open` → `detail: { start: string; end: string; resource: string | null; allDay: boolean }` — An empty slot or day was clicked, or Enter pressed on it: its start and end (ISO, UTC), its resource, and whether it is a whole day.; `view-change` → `detail: { value: 'day' | 'week' | 'days' | 'month' | 'year' | 'agenda' | 'timeline' }` — Fired when the component writes `view`. Does not bubble.

**Renders:** roles `columnheader` · `grid` · `gridcell` · `group` · `row` · `rowgroup` · `rowheader` · `toolbar` · `treegrid`

**Slot:** `event` — What an event draws; without it, its time and title.

**States:** `:state(disabled)` — `disabled` is set.; `:state(dragging)` — An event is being moved, resized or created with the pointer.

**Parts:** `[data-part="root"]` — The scheduler, a `role="group"` named by `label`.; `[data-part="toolbar"]` — The bar above the grid: previous, today, next, the period and the views.; `[data-part="prev"]` — The button to the previous period.; `[data-part="todayButton"]` — The button back to today.; `[data-part="next"]` — The button to the next period.; `[data-part="period"]` — The period on screen, which names the grid.; `[data-part="viewSwitcher"]` — The view buttons, shown when `views` offers more than one.; `[data-part="grid"]` — The `role="grid"` of the time slots, of the month's days, or of the timeline's rows (a `treegrid` when resources nest), which scrolls.; `[data-part="columnHeader"]` — A day's or a resource's header, a weekday's in the month, a slot's, day's or month's in the timeline.; `[data-part="rowHeader"]` — A resource's name at the start of its timeline row; a parent's carries the row's `aria-expanded`.; `[data-part="allDayRow"]` — The row of all-day events.; `[data-part="slot"]` — A cell: a time slot of a day and resource, its all-day cell, a day of the month or of the year, a resource's slot, day or month in the timeline.; `[data-part="event"]` — An event; `[data-before]` / `[data-after]` mark one that goes on past the piece shown, `[data-movable]` one that can be dragged, `[data-dragging]` the one being dragged.; `[data-part="resizeHandle"]` — An edge of an event that resizes it, `[data-edge="start"]` or `[data-edge="end"]`.; `[data-part="more"]` — A month day's «+N», the events that did not fit; it opens the day.; `[data-part="yearMonth"]` — A month of the year view, a `role="grid"` of its own.; `[data-part="agendaList"]` — The agenda's list of days.; `[data-part="nowLine"]` — The line at the current time.

**Shapes:** `SchedulerEvent { id: string; title: string; start: string; end: string; allDay?: boolean; resource?: string | string[]; color?: string; readonly?: boolean; draggable?: boolean; resizable?: boolean; background?: boolean }` · `SchedulerResource { id: string; label: string; color?: string; children?: SchedulerResource[]; readonly?: boolean; draggable?: boolean; resizable?: boolean; businessHours?: BusinessHours }`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**A week** — Events from an array: a start with a time is a timed event, a date alone is all day. Overlapping events share their day, and the line marks the current time. Click an event or an empty slot, or focus the grid and press Enter: the scheduler says which with `event-open` and `slot-open`. _(from the live demo)_

```html
<pdx-scheduler label="Team calendar" :events="events" first-day="1" scroll-to="08:00" @event-open="onEvent" @slot-open="onSlot"></pdx-scheduler>
<p class="pdx-txt-small pdx-ink-muted">{{ last }}</p>
```

**Month, year and agenda** — The same events in the other views. The month stacks a day's events under its number, all-day and multi-day events as bars, and counts what does not fit in a `+N` that opens the day; `day-max-events` sets how many fit. The year marks the days that have events, and a day opens on Enter or a click. The agenda lists the period's events by day, `agenda-days` of them. _(from the live demo)_

```html
<pdx-scheduler label="Team calendar, month" view="month" first-day="1" :events="events" day-max-events="2" @event-open="onEvent"></pdx-scheduler>
<p class="pdx-txt-small pdx-ink-muted">{{ last }}</p>
```

**By resource** — Give it `resources` and each one gets its own columns: an event goes where its `resource` says, and one that names two shows in both. A resource's `color` tints its events, and its own `businessHours` shade its columns. `group-by="date"` puts each day's resources together instead. _(from the live demo)_

```html
<pdx-scheduler label="Rooms" view="day" :date="today" :resources="rooms" :events="bookings" :views="['day', 'week']" scroll-to="08:00"></pdx-scheduler>
```

**Drag, resize, create** — With the mouse or a pen, drag an event to another time or room, pull its top or bottom edge to resize it, or drag over empty slots to create one. Drag the card below onto a room to book it. Each change asks first — `before-move`, `before-resize`, `before-create`, `external-drop` — and the app can refuse it with `preventDefault()`; then the scheduler writes `events`. Here `prevent-overlap` refuses a room that is already booked, and `rejected` says so. The workshop is `readonly`. _(from the live demo)_

```html
<div class="drag-demo">
  <div class="job" :ref="jobEl">Site visit · 1 h</div>
  <pdx-scheduler label="Rooms, bookable" view="day" :date="today" :resources="rooms" ::events="bookings" :views="['day', 'week']" scroll-to="08:00" prevent-overlap
    @move="onMove" @resize="onResize" @create="onCreate" @rejected="onRejected"></pdx-scheduler>
</div>
<p class="pdx-txt-small pdx-ink-muted" aria-live="polite">{{ last }}</p>
```

**Timeline** — `view="timeline"` puts each resource on a row along the period: `timeline-scale` is a day of slots, a week or a month of days, or a year of months. A resource's `children` sit under it, and the parent opens and closes with a click, Enter or the arrows. Events that overlap stack in their row. Only the rows and columns in view are drawn, so this fleet of 200 vans costs what a screenful does. _(from the live demo)_

```html
<pdx-segmented label="Timeline scale" :value="scale" options='["day","week","month","year"]' @value-change="e => scale = e.detail.value"></pdx-segmented>
<pdx-scheduler label="Fleet" view="timeline" :timeline-scale="scale" :date="today" :resources="fleet" :events="jobs" :views="['timeline']" scroll-to="08:00"></pdx-scheduler>
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

