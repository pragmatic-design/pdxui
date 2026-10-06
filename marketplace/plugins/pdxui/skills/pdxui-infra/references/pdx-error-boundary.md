### `<pdx-error-boundary>`

Catch and recover from render errors.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `maxRetries` | `maxretries` | number | `3` | Maximum retries before permanent fallback. 0 = no retry. Default: 3. |
| `autoRetry` | `autoretry` | boolean | `false` | Auto-retry on error (no user action needed). Default: false. |
| `retryDelay` | `retrydelay` | number | `1000` | Delay between auto-retries in ms. Default: 1000. |
| `fallbackMessage` | `fallbackmessage` | string | `''` | The fallback's message. Empty: the error-boundary.message component string, «Something went wrong.». |

**Events:** `pdx-error` → `detail: { error, retryCount }` — Fired when an error occurs.

**Renders:** roles `alert`

**Shapes:** `ErrorContext { error: Signal<Error | null>; retryCount: Signal<number>; canRetry: ReadonlySignal<boolean>; retry: () => void }`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Render Error — @try / @catch** — When content throws during render, the catch block shows with the actual error message.

```html
@try {
  <pdx-risky-widget />
} @catch (err) {
  <div role="alert">
    <p>{{ err.message }}</p>
  </div>
}
```

**`<pdx-error-boundary>` — Component Wrapper** — Declarative error boundary with built-in fallback UI, retry button, max retries, and `pdx-error` event for logging. Provides `errorContext` to descendants.

```html
<pdx-error-boundary
  fallback-message="Dashboard widget crashed."
  :max-retries="3"
  @pdx-error="onError">
  <pdx-dashboard-widget />
</pdx-error-boundary>
```

**Network Fetch — Retry with Countdown** — Simulates a network request that fails. Click "Load Users" to start. Auto-retries up to 3 times with a live countdown, then succeeds or gives up.

```html
@try {
  <pdx-user-list />
} @catch (err) {
  <div role="alert">
    {{ err.message }}
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

**Context Protocol — errorContext** — Provides `errorContext` to all descendants via hierarchical provide/inject. Children can `@inject errorContext;` to read error state, retry count, and trigger retries.

```js
// In a child component:
@inject errorContext;

// errorContext.error()    → Error | null
// errorContext.retryCount() → number
// errorContext.canRetry()  → boolean
// errorContext.retry()     → trigger retry
```

