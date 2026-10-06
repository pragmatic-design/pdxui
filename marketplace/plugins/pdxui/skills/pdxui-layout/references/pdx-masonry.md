### `<pdx-masonry>`

A staggered, Pinterest-style grid.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `columns` | `columns` | number \| 'auto' | `'3'` | Number of columns, or 'auto' to fit as many columns of `columnWidth` as the width allows. 0 and negatives mean 'auto' too. Anything else warns and is treated as 'auto'. |
| `columnWidth` | `columnwidth` | number | `250` | Minimum column width for auto mode (px) |
| `gap` | `gap` | string | `'1rem'` | Gap between items (CSS value) |


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**3 Columns**

```html
<pdx-masonry :columns="3" gap="1rem">
  <div style="height:120px">1</div>
  <div style="height:180px">2</div>
  ...
</pdx-masonry>
```

**4 Columns, Tighter Gap** _(from the live demo)_

```html
<pdx-masonry :columns="4" gap="0.5rem">
  <div class="masonry-card masonry-card-sm" style="height:80px">A</div>
  <div class="masonry-card masonry-card-sm" style="height:130px">B</div>
  <div class="masonry-card masonry-card-sm" style="height:90px">C</div>
  <div class="masonry-card masonry-card-sm" style="height:150px">D</div>
  <div class="masonry-card masonry-card-sm" style="height:100px">E</div>
  <div class="masonry-card masonry-card-sm" style="height:170px">F</div>
  <div class="masonry-card masonry-card-sm" style="height:110px">G</div>
  <div class="masonry-card masonry-card-sm" style="height:140px">H</div>
  <div class="masonry-card masonry-card-sm" style="height:120px">I</div>
  <div class="masonry-card masonry-card-sm" style="height:160px">J</div>
  <div class="masonry-card masonry-card-sm" style="height:85px">K</div>
  <div class="masonry-card masonry-card-sm" style="height:145px">L</div>
</pdx-masonry>
```

