### `<pdx-provide>`

Provide context to a subtree.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `name` | `name` | string | `''` | Context key name (for single value mode). |
| `value` | — | object | `null` | Value to provide (for single value mode). Reactive if signal. |
| `values` | — | object | `null` | Multiple values to provide (object of key→value). Takes priority over name/value. |


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Single Named Value** — Provide one value by name. Children inject it with `@inject` or `useProvided()`.

```html
<pdx-provide name="greeting" :value="greetingMsg">
  <!-- all descendants can inject('greeting') -->
  <pdx-my-widget />
</pdx-provide>
```

```js
// In pdx-my-widget setup:
const greeting = useProvided('greeting');
```

**Multiple Values** — Pass an object to `:values` to provide multiple keys at once.

```html
<pdx-provide :values="appConfig">
  <!-- inject('theme'), inject('locale'), inject('debug') -->
  <pdx-dashboard />
</pdx-provide>
```

```js
const appConfig = {
  theme: 'dark',
  locale: 'en',
  debug: false,
};
```

**Scoped Override** — Nested providers shadow outer ones. The nearest ancestor wins — like CSS cascading.

```html
<pdx-provide name="color" :value="'blue'">
  <!-- inject('color') → 'blue' -->
  <pdx-provide name="color" :value="'red'">
    <!-- inject('color') → 'red' (nearest wins) -->
  </pdx-provide>
  <!-- inject('color') → 'blue' again -->
</pdx-provide>
```

