### `<pdx-provide>`

Provide context to a subtree.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `token` | — | object | `null` | The context token the value is provided under (single value mode): `context<T>('name')`. |
| `value` | — | object | `null` | Value to provide (for single value mode). Reactive if signal. |
| `values` | — | object | `null` | Multiple values, a `Map` of token → value. Takes priority over token/value. |

**Provides:** the token in `:token`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Single Value** — Provide one value under a context token. Children inject it with `inject(Greeting, el)`.

```js
// greeting.ts
export const Greeting = context<string>('greeting');
```

```html
<pdx-provide :token="Greeting" :value="greetingMsg">
  <!-- all descendants can inject(Greeting, el) -->
  <app-my-widget />
</pdx-provide>
```

```js
// In app-my-widget setup:
const greeting = inject(Greeting, ctx.el);
```

**Multiple Values** — Pass a `Map` of token to value to `:values` to provide several at once.

```html
<pdx-provide :values="appConfig">
  <!-- inject(Theme, el), inject(Locale, el), inject(Debug, el) -->
  <app-dashboard />
</pdx-provide>
```

```js
const appConfig = new Map([
  [Theme, 'dark'],
  [Locale, 'en'],
  [Debug, false],
]);
```

**Scoped Override** — Nested providers of one token shadow outer ones. The nearest ancestor wins — like CSS cascading.

```html
<pdx-provide :token="Color" :value="'blue'">
  <!-- inject(Color, el) → 'blue' -->
  <pdx-provide :token="Color" :value="'red'">
    <!-- inject(Color, el) → 'red' (nearest wins) -->
  </pdx-provide>
  <!-- inject(Color, el) → 'blue' again -->
</pdx-provide>
```

