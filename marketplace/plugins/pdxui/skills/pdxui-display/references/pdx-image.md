### `<pdx-image>`

Lazy, responsive image with placeholder.

⚠️ **A bound `:src` is sanitised, and `data:image/svg+xml` is refused.** The policy
(`sanitizeMediaUrl`) accepts http(s), relative URLs, `blob:` and `data:image/{png,jpeg,gif,webp,avif}`.
An SVG is refused on purpose: opened as a document it runs its script. The attribute is then not
written at all, and in dev the console says which scheme was dropped — once per element.

Two asymmetries the policy's name does not give away:

- a **static** `src="data:image/svg+xml,…"` written in the template is **not filtered**: the
  sanitiser runs on bound attributes only;
- **`blob:` passes** — `URL.createObjectURL(file)`, the preview of a file the user just picked.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `src` | `src` | string | `''` | Image URL |
| `alt` | `alt` | string | `''` | Alt text for accessibility |
| `width` | `width` | string | `'auto'` | CSS width |
| `height` | `height` | string | `'auto'` | CSS height |
| `fit` | `fit` | string | `'cover'` | object-fit: cover \| contain \| fill \| none \| scale-down |
| `lazy` | `lazy` | boolean | `true` | Enable IntersectionObserver lazy loading |
| `fallback` | `fallback` | string | `''` | Fallback image URL on error |
| `fallbackIcon` | `fallbackicon` | string | `'image-off'` | Icon name shown on error (pragmatic-icons) |
| `placeholder` | `placeholder` | string | `'skeleton'` | Placeholder style: blur \| skeleton \| none |
| `ratio` | `ratio` | string | `''` | Aspect ratio e.g. '16/9', '1/1' |
| `rounded` | `rounded` | boolean | `false` | Circular border-radius |
| `radius` | `radius` | string | `''` | Custom border-radius value |
| `zoomable` | `zoomable` | boolean | `false` | Click to zoom (scale toggle) |
| `lightbox` | `lightbox` | boolean | `false` | Click opens fullscreen lightbox overlay |
| `caption` | `caption` | string | `''` | Caption text below image |
| `authSrc` | `authsrc` | string | `''` | URL requiring authentication (fetched via fetch + objectURL) |
| `authProvider` | — | object | `null` | Function returning HTTP headers for auth requests |
| `fetchFn` | — | object | `null` | Custom fetch function: (url: string) => Promise<Blob> |

**Events:** `pdx-error` → `detail: {}` — Fired when an error occurs.; `pdx-load` → `detail: {}` — Fired when content has loaded.; `pdx-zoom` → `detail: { zoomed }` — Fired on `pdx-zoom`.

**Renders:** roles `button` · `dialog`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Basic** — Simple image with src and alt.

```html
<pdx-image src="/photos/landscape.jpg" alt="Photo" width="400px" height="250px"></pdx-image>
```

**Object Fit** — cover, contain, fill side by side.

```html
<pdx-image src="..." fit="cover" width="200px" height="150px"></pdx-image>
<pdx-image src="..." fit="contain" width="200px" height="150px"></pdx-image>
<pdx-image src="..." fit="fill" width="200px" height="150px"></pdx-image>
```

**Aspect Ratio** — 16/9, 4/3, 1/1 aspect ratios with fixed width.

```html
<pdx-image src="..." width="200px" ratio="16/9"></pdx-image>
<pdx-image src="..." width="200px" ratio="4/3"></pdx-image>
<pdx-image src="..." width="150px" ratio="1/1"></pdx-image>
```

**Lazy Loading** — Scroll down to see images load. Uses IntersectionObserver with 200px rootMargin. Notice the skeleton placeholder.

```html
<!-- lazy is true by default -->
<pdx-image src="/photos/landscape.jpg" alt="Lazy" width="100%" height="200px" placeholder="skeleton"></pdx-image>
```

**Fallback** — Broken src triggers fallback icon (image-off). Custom fallback icon also supported.

```html
<!-- Default fallback icon -->
<pdx-image src="/missing-image.jpg" alt="Broken" width="200px" height="150px"></pdx-image>

<!-- Custom fallback icon -->
<pdx-image src="/missing-image.jpg" fallback-icon="alert-triangle"></pdx-image>
```

**Rounded** — Circular avatar-like image with `rounded` prop.

```html
<pdx-image src="..." width="80px" height="80px" :rounded="true" ratio="1/1"></pdx-image>
```

**Zoomable** — Click to zoom in (2x), click again to zoom out.

```html
<pdx-image src="..." :zoomable="true" width="300px" height="200px"></pdx-image>
```

**Lightbox** — Click to open fullscreen overlay. Press Escape or click to close.

```html
<pdx-image src="..." :lightbox="true" caption="Mountain landscape"></pdx-image>
```

**Caption** — Caption text below the image.

```html
<pdx-image src="..." caption="A beautiful mountain view"></pdx-image>
```

**Authenticated Image** — Uses `:fetch-fn` to load images from protected endpoints. The function adds JWT headers and returns a Blob. Below: simulated auth fetch with a 1s delay (same-origin in production).

```js
// Production: fetch with JWT headers
function authFetch(url) {
  return fetch(url, {
    headers: { Authorization: 'Bearer ' + getToken() }
  }).then(r => r.blob());
}
```

```html
<pdx-image src="/api/images/123"
  :fetch-fn="authFetch">
</pdx-image>
```

```js
// Or use auth-src + auth-provider:
```

```html
<pdx-image auth-src="/api/images/123"
  :auth-provider="() => ({ Authorization: 'Bearer ...' })">
</pdx-image>
```

**Custom Fetch** — Uses `:fetch-fn` for full control over image fetching. This demo adds a 1.5s simulated delay.

```html
<pdx-image src="/photo.jpg"
  :fetch-fn="customFetch">
</pdx-image>
```

```js
function customFetch(url) {
  return fetch(url, { headers: getAuth() })
    .then(r => r.blob());
}
```

