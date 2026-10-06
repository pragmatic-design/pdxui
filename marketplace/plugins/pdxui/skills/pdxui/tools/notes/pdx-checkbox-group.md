**The children are `<pdx-checkbox value="…">`.** The group reads each child's `value`, keeps `value`
as the comma-separated list of the checked ones, and emits one `pdx-change` per click with
`detail: { value: 'a,c', values: ['a', 'c'] }`. A child with no `value` falls back to its `label`;
with neither, the group cannot report it and warns once.

```html
<pdx-checkbox-group :value="signs" @pdx-change="e => signs = e.detail.value">
  <pdx-checkbox value="fever">Febbre</pdx-checkbox>
  <pdx-checkbox value="cough">Tosse</pdx-checkbox>
</pdx-checkbox-group>
```

Listen on the group, not on the children: the children's own `pdx-change` stops at the group, and
the group's `value` always matches what is checked. Classes you put on the group are kept.
