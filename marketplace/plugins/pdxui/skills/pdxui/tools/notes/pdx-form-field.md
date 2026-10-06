**Fields space themselves.** Each `pdx-form-field` leaves `--pdx-form-field-gap` (space-md, scaled by
density) below itself, the last one in its container none, so a card body, a grid cell or a plain
`div` needs no wrapper. Inside `pdx-form`, `pdx-stack gap`, `pdx-row`, `pdx-grid`, `pdx-cluster`,
`pdx-form-section` and `pdx-field-group` the parent's gap is used instead, not added. In a flex or
grid container of your own that has a `gap`, drop the gap or set `margin-block-end: 0` on the fields:
otherwise the two add up. Tune the rhythm with the token, not with spacers.

**`error` alone shows nothing until the field is touched.** The message appears when the field is
touched, when `show-error` is set, or when its form validates `onChange`, so a field does not shout
while the user is still typing. An error decided by code, not by typing (a server rejection, a check
on save), goes with `show-error`:

```pdx
<template>
  <pdx-form-field label="PIN" :error="pinError" show-error><pdx-input type="password" /></pdx-form-field>
</template>
<script setup>
let pinError = $signal(''); // set when the server refuses the PIN: pinError = 'Wrong PIN'
</script>
```
