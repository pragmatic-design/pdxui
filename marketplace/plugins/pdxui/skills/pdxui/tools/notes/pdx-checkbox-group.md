**The children are `<pdx-checkbox value="…">`.** The group reads each child's `value`, keeps `value`
as the comma-separated list of the checked ones — its model — and announces one `value-change` per
click with `detail: { value: 'a,c' }`. A child with no `value` falls back to its `label`; with neither,
the group cannot report it and warns once.

```html
<pdx-checkbox-group ::value="signs">
  <pdx-checkbox value="fever">Febbre</pdx-checkbox>
  <pdx-checkbox value="cough">Tosse</pdx-checkbox>
</pdx-checkbox-group>
```

Listen on the group, not on the children: the children's own `checked-change` stops at the group,
and the group's `value` always matches what is checked. Classes you put on the group are kept.

In a native `<form>` the group is the field: `name` goes on the group, which submits one entry per
checked value, and `form.reset()` puts its selection back, the children with it.
