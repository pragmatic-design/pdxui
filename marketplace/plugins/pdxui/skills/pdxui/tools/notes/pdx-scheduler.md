**Use it when** events live in time and someone plans them: a day or week of slots, by person, room or
machine, a month, a year, an agenda, or a timeline of resources in rows — moved, resized, created, edited,
repeated, exported.
**Not when** only dates are picked → `pdx-date-picker` or `pdx-calendar`; a list of past happenings →
`pdx-timeline`; a board of stages → `pdx-kanban`.

**Pitfalls**
- A start or end has three shapes, and the shape is the meaning: `2026-09-21T09:00` is a wall time in
  `time-zone`, `2026-09-21T07:00:00Z` (or with an offset) an instant, `2026-09-21` a whole day, its `end`
  the day AFTER the last. The scheduler writes a changed event back in the shape it was written in.
- Bind `::events`: the scheduler writes `events` itself after every change the app allowed. Refuse a change
  in its `before-*` (`before-move`, `before-resize`, `before-create`, `before-save`, `before-remove`,
  `before-import`) with `preventDefault()`, never by putting the old array back afterwards.
- Load by period: `period-change` gives the view's `start` and `end`; fetch those events and set `events`.
- A series is one event with `rrule` (FREQ, INTERVAL, COUNT, UNTIL, BYDAY, BYMONTHDAY, BYMONTH, WKST) and
  `exdate`; an override is its own event with `seriesId` and `recurrenceId`. A drawn occurrence's `id` is
  the scheduler's (`<series>::<start>`), not one of `events`. `scope` on `before-move` / `before-resize`
  is the app's to set ('occurrence', the default, or 'series'); the editor asks the reader.
- `import` and `export` are reserved words: the events after them are `imported` and `exported`; the
  delete is `remove`.
- `editorFields(event, set)` adds to the built-in editor and validates nothing: check what `set` wrote in
  `before-save`. `editorContent(event, actions)` replaces the fields and buttons, not the dialog.
- The app's own fields ride on the event (`client`, `priority`): `events` keeps them, the files do not —
  CSV and Excel carry title, times, resource and notes; iCalendar also the colour, the rule and the
  exceptions.

**Composes with** `useDrag` from `@pdxui/core` (an app element dropped on the grid, `external-drop`) ·
a file input for `importIcs(text)` · `pdx-splitter` beside a list of unplanned work to drag in.
