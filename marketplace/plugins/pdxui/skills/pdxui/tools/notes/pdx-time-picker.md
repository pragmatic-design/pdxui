**The value** is `HH:mm` (`HH:mm:ss` with `show-seconds`) on the 24-hour clock, whatever the display
format. It is on the element after every change — `el.value` equals `pdx-change.detail.value` — so a
form can bind it like any other input.

**`''` means empty**, as in the native `<input type="time">`: every segment shows `--`, a screen reader
hears the `time-picker.empty` string instead of a number, and `el.value` is `''`. The first arrow press,
typed digit or wheel step on a segment starts from `min` (if set) or 00:00. `el.clear()` returns to
empty and emits `pdx-change {value: ''}`. There is no `placeholder` prop: `--` is the empty display.

Typing fills a segment: two digits (or one that cannot start a larger number, like `3` for the hour)
move to the next segment.
