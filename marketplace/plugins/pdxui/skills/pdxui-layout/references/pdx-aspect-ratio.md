### `<pdx-aspect-ratio>`

Lock content to a fixed ratio.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `ratio` | `ratio` | string | `'16/9'` | Aspect ratio as "width/height" string (e.g. "16/9", "4/3", "1/1") or number |


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Common Ratios** — 16:9 (Video)

```html
<pdx-aspect-ratio ratio="16/9">
  <img src="..." />
</pdx-aspect-ratio>

<pdx-aspect-ratio ratio="1/1">
  <div>Square content</div>
</pdx-aspect-ratio>
```

