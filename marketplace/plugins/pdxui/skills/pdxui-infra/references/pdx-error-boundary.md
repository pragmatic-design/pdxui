### `<pdx-error-boundary>`

Catch and recover from render errors.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `maxRetries` | `maxretries` | number | `3` | Maximum retries before permanent fallback. 0 = no retry. Default: 3. |
| `autoRetry` | `autoretry` | boolean | `false` | Auto-retry on error (no user action needed). Default: false. |
| `retryDelay` | `retrydelay` | number | `1000` | Delay between auto-retries in ms. Default: 1000. |
| `fallbackMessage` | `fallbackmessage` | string | `''` | The fallback's message. Empty: the error-boundary.message component string, «Something went wrong.». |

**Events:** `pdx-error` → `detail: { error: Error; retryCount: number }` — A child threw; the error, and how many retries have been made.

**Renders:** roles `alert`

**Provides:** `ErrorContext`

**States:** `:state(error)` — A child threw: the fallback shows. Cleared when Retry brings the children back.

**Parts:** `[data-part="fallback"]` — The fallback shown in place of the children (`role="alert"`).; `[data-part="message"]` — The fallback's message: `fallbackMessage`, or the component string.; `[data-part="detail"]` — The error's own message, under it.; `[data-part="retry"]` — The Retry button, while retries are left; the note that none are, after.

**Shapes:** `ErrorContext { error: Signal<Error | null>; retryCount: Signal<number>; canRetry: ReadonlySignal<boolean>; retry: () => void }`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Render Error — @try / @catch** — When content throws during render, the catch block shows with the actual error message.

```html
@try {
  <app-risky-widget />
} @catch (err) {
  <div role="alert">
    <p>{{ err instanceof Error ? err.message : String(err) }}</p>
  </div>
}
```

**`<pdx-error-boundary>` — Component Wrapper** — Declarative error boundary with built-in fallback UI, retry button, max retries, and `pdx-error` event for logging. Provides `ErrorContext` to descendants.

```html
<pdx-error-boundary
  fallback-message="Dashboard widget crashed."
  :max-retries="3"
  @pdx-error="onError">
  <app-dashboard-widget />
</pdx-error-boundary>
```

**Network Fetch — Retry with Countdown** — Simulates a network request that fails. Click "Load Users" to start. Auto-retries up to 3 times with a live countdown, then succeeds or gives up.

```html
@try {
  <app-user-list />
} @catch (err) {
  <div role="alert">
    {{ err instanceof Error ? err.message : String(err) }}
    <button @click="retry">Retry</button>
  </div>
}
```

```js
// Or with onGlobalError:
onGlobalError((error, ctx) => {
  if (ctx.source === 'async') {
    showToast(error.message);
    return true; // handled
  }
});
```

**onGlobalError — App-wide Interceptor** — Catches all errors not handled by local boundaries. The log below shows errors intercepted globally.

```js
import { onGlobalError } from '@pdxui/core';

onGlobalError((error, context) => {
  telemetry.log({
    source: context.source,
    component: context.component,
    message: error.message,
  });
  // return true to suppress console.error
  return true;
});
```

**Context Protocol — ErrorContext** — Provides its state to all descendants under the `ErrorContext` token. Children can `@inject boundary from ErrorContext;` to read error state, retry count, and trigger retries.

```js
// In a child component (ErrorContext comes from '@pdxui/ui/error-boundary'):
@inject boundary from ErrorContext;

// boundary.error()      → Error | null
// boundary.retryCount() → number
// boundary.canRetry()   → boolean
// boundary.retry()      → trigger retry
```

