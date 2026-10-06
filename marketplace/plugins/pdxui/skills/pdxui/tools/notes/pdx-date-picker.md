**Use it when** a form asks for a date, a date-time, a range, a week, a month, a quarter or a year — and,
with `editable`, lets it be typed.
**Not when** only a time is wanted → `pdx-time-picker`; a calendar always on screen, with no field →
`pdx-calendar`.

**Pitfalls**
- Without `editable` the date cannot be typed at all, and `editable` covers the modes `date` and `datetime` only.
- An editable value commits on Enter or blur — AFTER the native `change` of its text box. Listen to
  `pdx-change`, not `change`, or a resumed draft comes back without its end date.
- A typed date that does not exist, or falls outside `min`/`max`, marks the field invalid and keeps the last
  good value.
- `pdx-change.detail` has a different shape per mode: `{ value }`, `{ rangeStart, rangeEnd }`, `{ value, time }`,
  `{ values }`…
- `calendar` changes the display only; the value and its math stay Gregorian ISO.

**Composes with** `pdx-form` + `pdx-form-field` (wired by `name`) · `pdx-auto-form` / `pdx-form-template` (a
schema `date` field is drawn as an editable picker) · `@form` touched state (it emits `pdx-blur` when focus
leaves both the field and its panel).
