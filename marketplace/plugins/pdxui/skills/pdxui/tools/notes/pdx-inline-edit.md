**`type="number"` and `type="currency"` keep the decimals the display can show.** The editor keeps
`precision` decimals: by default the currency's own (2 for EUR, 0 for JPY) or, for a plain number,
up to 3 — 29.5 edited to «30.2» saves 30.2. Set `precision` to fix it (`precision="0"` saves whole
numbers). The number editor shows the value with that many decimals while you edit («29.500»).

```html
<pdx-inline-edit type="number" :value="weight" @pdx-change="e => weight = e.detail.value"></pdx-inline-edit>
<pdx-inline-edit type="currency" currency="EUR" precision="2" :value="price"></pdx-inline-edit>
```
