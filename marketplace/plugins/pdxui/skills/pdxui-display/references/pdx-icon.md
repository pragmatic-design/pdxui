### `<pdx-icon>`

Crisp SVG icons from a shared set.

**A `name` that is not in the set renders nothing, silently.** The built-in set is `pragmatic`, and
`pdx-icon` registers it itself, so it is the default: `<pdx-icon name="search">` works with no
setup. Its names are listed below, generated from `packages/ui/src/icon/pragmatic-icons.ts`.

`set="lucide"` is **not** a library that ships with it: `@pdxui/ui/icon/lucide-icons` exports
`registerLucideIcons(icons)`, and `icons` is a `{ name: svgString }` map the app provides, for example
a subset extracted from `lucide-static`. Until the app calls it, every `set="lucide"` icon is empty.
Any other set: `registerIconSet(name, resolver)` from `@pdxui/core`, then `set="<name>"`.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `name` | `name` | string | `''` | Form field name, submitted with the form. |
| `set` | `set` | string | `''` | Icon set to draw from (registered sets). |
| `svg` | `svg` | string | `''` | Raw inline SVG markup to render. |
| `src` | `src` | string | `''` | URL of an external SVG to load. |
| `size` | `size` | string | `'md'` | Size of the control (e.g. sm, md, lg). |
| `label` | `label` | string | `''` | Visible label text. |
| `weight` | `weight` | 'thin' \| 'light' \| 'regular' \| 'bold' | `''` | Weight override: thin(1) light(1.5) regular(2) bold(2.5). Default: inherit from --pdx-icon-weight or 'regular'. |
| `rtl` | `rtl` | 'none' \| 'mirror' | `'none'` | RTL behavior: 'mirror' flips in RTL context, 'none' keeps as-is. Default: 'none'. |
| `spin` | `spin` | boolean | `false` | Spin animation for loading indicators. |

**Renders:** roles `img`

**Built-in names** (358, set `pragmatic`, the default): `arrow-left` `arrow-right` `arrow-up` `arrow-down` `chevron-left` `chevron-right` `chevron-up` `chevron-down` `chevrons-left` `chevrons-right` `home` `menu` `more-horizontal` `more-vertical` `external-link` `check` `check-circle` `x` `x-circle` `plus` `plus-circle` `minus` `minus-circle` `copy` `clipboard` `download` `upload` `refresh` `trash` `edit` `save` `send` `link` `share` `undo` `redo` `mail` `bell` `message-circle` `phone` `search` `filter` `sort-asc` `sort-desc` `list` `type` `bold` `italic` `underline` `align-left` `align-center` `align-right` `grid` `columns` `table` `file` `file-text` `folder` `image` `eye` `eye-off` `lock` `unlock` `settings` `sliders` `alert-circle` `alert-triangle` `info` `help-circle` `loader` `spinner` `user` `users` `shield` `shield-check` `calendar` `clock` `tag` `bookmark` `star` `heart` `zap` `sun` `moon` `circle-user` `sliders-horizontal` `keyboard` `folder-kanban` `share-2` `rows-3` `group` `database` `server` `cloud` `globe` `terminal` `code` `package` `key` `log-in` `log-out` `activity` `trending-up` `bar-chart` `pie-chart` `archive` `arrow-down-left` `arrow-left-right` `arrow-up-right` `at-sign` `award` `badge-alert` `badge-check` `badge-minus` `badge-plus` `badge-x` `banknote` `barcode` `battery` `battery-charging` `bell-off` `bell-ring` `binary` `bluetooth` `book` `book-open` `box` `boxes` `braces` `briefcase` `brush` `bug` `building` `calculator` `calendar-check` `calendar-clock` `calendar-days` `calendar-minus` `calendar-plus` `camera` `chart-area` `chart-bar` `chart-column` `chart-line` `chart-no-axes-column` `chart-pie` `check-square` `chevrons-up-down` `circle` `circle-alert` `circle-check` `circle-dot` `circle-help` `circle-minus` `circle-pause` `circle-play` `circle-plus` `circle-x` `cloud-download` `cloud-off` `cloud-upload` `cog` `coins` `compass` `component` `contact` `corner-down-left` `corner-up-right` `cpu` `credit-card` `crop` `crosshair` `crown` `diamond` `eraser` `expand` `fast-forward` `file-archive` `file-audio` `file-check` `file-code` `file-image` `file-input` `file-json` `file-minus` `file-output` `file-plus` `file-search` `file-spreadsheet` `file-video` `file-x` `files` `film` `fingerprint` `flag` `flip-horizontal` `flip-vertical` `focus` `folder-check` `folder-minus` `folder-open` `folder-plus` `form-input` `forward` `gem` `gift` `git-branch` `git-commit` `git-merge` `git-pull-request` `grab` `graduation-cap` `grip-horizontal` `grip-vertical` `hammer` `hand` `hard-drive` `hash` `heading` `headphones` `highlighter` `history` `hourglass` `id-card` `inbox` `infinity` `key-round` `laptop` `layers` `layout` `layout-dashboard` `layout-grid` `layout-list` `list-checks` `list-filter` `list-minus` `list-ordered` `list-plus` `list-tree` `lock-keyhole` `map` `map-pin` `maximize` `megaphone` `message-square` `message-square-plus` `mic` `mic-off` `minimize` `monitor` `mouse-pointer-click` `move` `music` `navigation` `newspaper` `notebook` `octagon-alert` `omega` `package-check` `package-x` `paintbrush` `palette` `panel-bottom` `panel-left` `panel-right` `panel-top` `pause` `pen-line` `pencil` `pencil-line` `percent` `pi` `pilcrow` `pin` `play` `plug` `pointer` `power` `printer` `qr-code` `quote` `radio` `receipt` `rectangle-horizontal` `rectangle-vertical` `regex` `repeat` `reply` `reply-all` `rewind` `rotate-ccw` `rotate-cw` `route` `rss` `ruler` `satellite` `scan` `scan-barcode` `scan-line` `scissors` `scroll` `shield-alert` `shield-off` `shopping-bag` `shopping-cart` `shrink` `sidebar` `sigma` `signal` `signpost` `skip-back` `skip-forward` `smartphone` `space` `sparkles` `spell-check` `split` `square` `store` `strikethrough` `subscript` `superscript` `tablet` `tags` `target` `test-tube` `text-cursor` `text-cursor-input` `thumbs-down` `thumbs-up` `ticket` `timer` `toggle-left` `toggle-right` `trending-down` `triangle-alert` `trophy` `truck` `usb` `user-check` `user-cog` `user-minus` `user-plus` `user-x` `users-round` `variable` `video` `volume-x` `wallet` `wand-sparkles` `wifi` `wifi-off` `wrench` `dollar-sign` `bar-chart-2` `arrow-down-circle` `gallery-horizontal` `image-off`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Built-in Pragmatic Icons** — {{ iconCount }} icons included. Zero dependencies. Register with `registerPragmaticIcons()`.

```js
import { registerPragmaticIcons } from '@pdxui/ui/icon/pragmatic-icons';
registerPragmaticIcons();
```

```html
<pdx-icon name="check" size="lg"></pdx-icon>
<pdx-icon name="settings" size="md"></pdx-icon>
```

**Sizes** — 5 preset sizes. Optical size compensation adjusts stroke weight for smaller icons.

```html
<pdx-icon name="settings" size="xs"></pdx-icon>  <!-- 12px -->
<pdx-icon name="settings" size="sm"></pdx-icon>  <!-- 16px -->
<pdx-icon name="settings" size="md"></pdx-icon>  <!-- 20px (default) -->
<pdx-icon name="settings" size="lg"></pdx-icon>  <!-- 24px -->
<pdx-icon name="settings" size="xl"></pdx-icon>  <!-- 32px -->
```

**Weight** — Override stroke weight. Thin (1px), light (1.5), regular (2), bold (2.5).

```html
<pdx-icon name="heart" weight="thin"></pdx-icon>
<pdx-icon name="heart" weight="bold"></pdx-icon>
```

**Color Inheritance** — Icons use `currentColor` — wrap in an ink class or set color on parent.

```html
<span class="pdx-ink-primary">
  <pdx-icon name="check-circle" size="lg"></pdx-icon>
</span>
<span class="pdx-ink-danger">
  <pdx-icon name="alert-circle" size="lg"></pdx-icon>
</span>
```

**Accessibility** — Without `label`: decorative (`aria-hidden`). With `label`: semantic (`role="img"`).

```html
<!-- Decorative (next to text label) -->
<button class="pdx-danger">
  <pdx-icon name="trash"></pdx-icon> Delete
</button>

<!-- Semantic (icon-only button) -->
<button class="pdx-ghost">
  <pdx-icon name="trash" label="Delete item"></pdx-icon>
</button>
```

**Inline SVG & URL** — Use `svg` prop for inline markup or `src` for external URL. No icon set needed.

```html
<!-- Inline SVG -->
<pdx-icon svg="<svg viewBox='0 0 24 24'>...</svg>"></pdx-icon>

<!-- External URL -->
<pdx-icon src="/icons/custom.svg"></pdx-icon>

<!-- Third-party set (e.g., Lucide) -->
```

```js
registerIconSet('lucide', (name) => lucideIcons[name]);
```

**Multiple Icon Sets** — Register multiple sets and use them simultaneously. The first registered becomes the default. Use the `set` prop to pick a specific set per icon.

```js
// Register multiple sets — first one becomes default
registerPragmaticIcons();  // "pragmatic" set (89 icons)

// Add third-party sets alongside
registerIconSet('lucide', resolver);
registerIconSet('heroicons', resolver);

// Usage: default set (first registered)
```

```html
<pdx-icon name="home"></pdx-icon>
```

```js
// Usage: explicit set prop
```

```html
<pdx-icon name="home" set="lucide"></pdx-icon>
<pdx-icon name="home" set="heroicons"></pdx-icon>
```

```js
// Mix freely in the same UI
```

```html
<pdx-icon name="plus"></pdx-icon>
<pdx-icon name="sparkles" set="lucide"></pdx-icon>
```

**Composition** — Icons in realistic UI contexts. _(from the live demo)_

```html
<div class="comp-demos">
  <div class="comp-row">
    <button class="pdx-primary"><pdx-icon name="plus" size="sm"></pdx-icon> New Project</button>
    <button class="pdx-secondary"><pdx-icon name="download" size="sm"></pdx-icon> Export</button>
    <button class="pdx-danger"><pdx-icon name="trash" size="sm"></pdx-icon> Delete</button>
    <button class="pdx-ghost"><pdx-icon name="settings" size="sm"></pdx-icon></button>
  </div>
  <div class="comp-card">
    <div class="comp-card-row">
      <span class="pdx-ink-success"><pdx-icon name="check-circle" size="md"></pdx-icon></span>
      <div>
        <span class="pdx-txt-small">Deployment successful</span>
        <span class="pdx-txt-caption pdx-ink-muted">Production v2.4.1 · 2 min ago</span>
      </div>
    </div>
    <div class="comp-card-row">
      <span class="pdx-ink-warning"><pdx-icon name="alert-triangle" size="md"></pdx-icon></span>
      <div>
        <span class="pdx-txt-small">High memory usage</span>
        <span class="pdx-txt-caption pdx-ink-muted">Server node-3 · 89% used</span>
      </div>
    </div>
    <div class="comp-card-row">
      <span class="pdx-ink-danger"><pdx-icon name="x-circle" size="md"></pdx-icon></span>
      <div>
        <span class="pdx-txt-small">Build failed</span>
        <span class="pdx-txt-caption pdx-ink-muted">Branch feature/auth · 5 min ago</span>
      </div>
    </div>
  </div>
</div>
```

