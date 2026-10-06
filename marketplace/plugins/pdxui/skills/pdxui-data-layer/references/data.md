<!-- Copied from packages/site/content/docs/data.md by gen-topics.mjs: edit it there. -->

# Data layer

Loading data from an API seems simple until you count everything you actually need: the loading
state, error handling, refetching when params change, caching to avoid repeating the same call,
invalidation when you write. Doing it by hand in every component is repetitive and fragile. `@fetch`
declares it once.

## @fetch: the declaration

```pdx
@fetch users: 'GET /api/users';
```

The **method is part of the string** — `'GET /api/users'`, not `'/api/users'`. Without it the
declaration is not recognised, and an unrecognised declaration is **dropped**: no `resource`, and
every read of `users` below finds nothing. You get `PDX_FETCH_INVALID` for it, which is the
diagnostic to look for when a page that reads `users.data` renders nothing at all.

From this one line the compiler generates a typed `resource()` with three states you use directly in
the template:

```pdx
@if (users.loading) { <pdx-spinner /> }
@if (users.error)   { <p class="err">{{ users.error.message }}</p> }
@for (users.data as u; track u.id) { <li>{{ u.name }}</li> }
```

You didn't write a `useState`/`useEffect`, didn't hand-manage `try/catch`, don't have an `isLoading`
flag to remember to turn off. You declared *which data you want*, and the state is modeled for you.

## Reactive params

Often the URL depends on some state (the selected id, a query). Put it in with `${...}`:

```pdx
@prop id: string = '';
@fetch user: 'GET /api/users/${id}' : User;
```

When `id` changes, the resource **re-runs itself** with the new value — same principle as signals:
you declared the dependency by writing it, not by managing it. The trailing `: User` is the result
type.

## Cache: don't repeat the same call

Two components asking for `/api/users` shouldn't make two requests. The resource caches by key; you
can control how long data stays "fresh" and group it with tags for invalidation:

```pdx
@fetch users: 'GET /api/users' { staleTime: 60000, tags: ['users'] };
```

`staleTime` avoids needless refetches within the window; the `tags` serve the next step.

## Mutations: write and keep everything consistent

After a POST/PUT/DELETE, the lists that showed that data are stale. Instead of updating them by hand
one by one, a mutation **invalidates tags** and the linked resources refetch:

```pdx
async function addUser(dto) {
  await mutate('/api/users', { method: 'POST', body: dto, invalidates: ['users'] });
  // every @fetch tagged 'users' refreshes itself
}
```

The mental model is the same as reactivity: you declare the relationships (this resource has these
tags), and the update propagates.

## Writing before the server agrees

Invalidating after the response is honest and slow: the user waits a round trip to see their own
click. An **optimistic** write puts the new value in the cache immediately and undoes it if the
server refuses.

```ts
import { mutation } from '@pdxui/core';

const rename = mutation({
    fn: (input) => http.put(`/api/users/${input.id}`, input),
    optimistic: {
        key: '/api/users',
        update: (current, input) => (current as User[]).map(u => u.id === input.id ? { ...u, ...input } : u),
    },
    invalidate: ['users'],
});

await rename.execute({ id: 7, name: 'Ada' });   // the list shows Ada before the request lands
```

What happens, in order: the cache entry is **snapshotted**, the optimistic value is written, the
request goes out. On success the cache is invalidated by tag and the real data arrives. On failure
the snapshot goes back — and `execute` rejects, so the `catch` is yours to write.

**The rollback is the half that makes this safe**, and it has one behaviour worth knowing: if the
key had **no entry** before the write, the rollback **removes** it rather than restoring
`undefined`. An entry holding `undefined` is a cache hit, and a later read would trust it instead
of fetching.

Three more things the type does not say:

- **`update` throwing is not fatal.** If your update function raises, the optimistic step is
  skipped and the mutation proceeds as a normal write — you do not get a half-applied cache.
- **`execute()` refuses to run twice at once.** A second call while one is pending rejects with
  `Mutation already in progress` — the double-submit guard, so a double-clicked button sends one
  request.
- **`state()` is `idle | pending | success | error`**, and `pending()` is the one to disable a
  button with.

Optimistic is for writes whose outcome you can predict — renames, toggles, adding a row. For a
write whose result the server computes (a total, an invoice number, a generated id), show the
pending state and wait: guessing produces a number that changes under the reader.

## Keeping data fresh

Three ways, in the order you should reach for them.

**When the window comes back.** On by default:

```pdx
@fetch users: 'GET /api/users';   // refetchOnFocus and refetchOnReconnect are true
```

A user who alt-tabs away for ten minutes gets fresh data on return, and an app that was offline
refetches when the network comes back. This is the one that costs nothing.

**Polling**, when the data changes without you and there is no push:

```ts
import { useQuery } from '@pdxui/core';

// The first argument is the FETCHER, not a URL: useQuery(queryFn, options).
const jobs = useQuery(() => http.get('/api/jobs'), { refetchInterval: 5000 });   // every 5s
jobs.dispose();                                                                   // stops it
```

**A hidden tab is not polled.** The interval pauses while `document.visibilityState` is `hidden`
and resumes when the tab comes back. That costs nothing, because `refetchOnFocus` is on by default
and refetches on return anyway: the same freshness the moment the user looks, and none of the
requests in between. The exception is an app that turned `refetchOnFocus` **off** — it has no
catch-up, so for that app the interval keeps running hidden.

**A tick that arrives while the last refetch is still in flight is skipped.** Polling every second
means asking every second, not starting a request every second regardless of the one before: at a
1s interval against a 3s endpoint, starting a request per second regardless would mean none of them
is ever the one whose result gets used.

**`dispose()` is for a query you created outside a component.** Inside one, the query is torn down
with the component — the interval and both listeners — because it registers with the same ownership
scope that disposes the component's effects. A query created at module level has no scope to belong
to, and there `dispose()` is the only thing that stops it.

Both behaviours above are pinned in `packages/core/tests/use-query-interval.test.ts`.

**A push from the server** is the right answer for most of what polling gets used for — see
[Live data](#live-data-a-push-from-the-server) above. Polling is what you use when the source
cannot push: a third-party API, a job queue you only own the read side of.

## Direct HttpClient

Under `@fetch` there's a typed `HttpClient` with a middleware pipeline and consistent error handling.
For imperative calls outside the declarative pattern (e.g. inside a handler) you use it directly,
with the same baseline behaviour.

```ts
import { getDefaultClient } from '@pdxui/core';

const user = await getDefaultClient().get<User>('/api/users/1');
```

## Middleware

Two are on by default, because an application that has neither is worse off and nobody asks for it:

| | |
|---|---|
| **timeout** | 30 s. A request with no deadline never fails: `loading` stays true and no `error` is ever produced. Set `timeout: 0` to disable it. |
| **retry** | Idempotent methods only — GET, HEAD, OPTIONS, PUT, DELETE — on 5xx, 408 and 429, with backoff. A POST or PATCH is never replayed. Set `retry: false` to disable it. |

The rest are opt-in. You install them once, at startup, with `configureClient`:

```ts
import { configureClient, authMiddleware, csrfMiddleware, offlineMiddleware } from '@pdxui/core';

configureClient({
  baseUrl: '/api',
  middleware: [
    authMiddleware({ getToken: () => auth.getToken() }),
    csrfMiddleware(),
    offlineMiddleware(),
  ],
});
```

Order matters: the first entry is the outermost, so it sees the request first and the response last.
The two defaults run outside whatever you list here.

| Middleware | What it does |
|---|---|
| `authMiddleware({ getToken })` | Adds `Authorization: Bearer <token>` per request. `getToken` may be async and may return `null` to skip. `header` and `prefix` are configurable. `auth` above is a [`createAuthStore`](../../pdxui-testing/references/permissions.md) — it owns the token, so nothing here reads storage by hand. |
| `csrfMiddleware()` | See below. |
| `offlineMiddleware()` | See *Offline*. |
| `logMiddleware()` | Request/response logging for development. |
| `retryMiddleware({ … })` | The default one, if you want to tune `maxRetries`, `baseDelay` or `retryStatuses`. Pass it through `retry: { … }` rather than listing it twice. |
| `timeoutMiddleware(ms)` | A per-chain deadline. Prefer the `timeout` config field; this exists for the case where one client needs different deadlines per branch of its chain. |

### CSRF

`csrfMiddleware()` reads the `XSRF-TOKEN` cookie and sends it back as the `X-XSRF-TOKEN` header on
every method that is not GET, HEAD or OPTIONS. Both names are configurable:

```ts
csrfMiddleware({ cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' })
```

If the cookie is absent the request goes out without the header. That is deliberate — the client
cannot invent a token, and the server is the authority on whether to accept the request. Installing
this middleware does not make an app CSRF-safe on its own; it satisfies the browser half of the
double-submit pattern.

## Offline

For apps that must survive intermittent connectivity, `offlineMiddleware` queues mutations while the
network is down and **replays** them on reconnect, so a user action isn't lost just because there was
no signal at that moment. It is opt-in — install it and it works:

```ts
import { configureClient, offlineMiddleware } from '@pdxui/core';

configureClient({ middleware: [offlineMiddleware({ maxQueueSize: 50 })] });
```

GET requests pass straight through in both directions: only mutations are queued. A queued request
rejects with `OfflineError` so the caller knows it has not happened yet, and the queue drops its
oldest entry once `maxQueueSize` is reached.

**The replay is sequential, in the order the calls were made** — FIFO, one at a time, waiting for
each before sending the next. That is not an implementation detail to optimise away: two writes to
the same record replayed out of order leave the wrong value, and a create replayed after the update
that depends on it fails outright.

**A mutation made while the queue is draining waits for it too.** The device reconnects, three
queued writes start going out, the user saves a fourth — and the fourth is behind the other three,
not racing them. It is the same rule as the reload case below and for the same reason: FIFO is a
guarantee about the order the calls were MADE, and a write that goes straight out because the
device happens to be online again can reach the server first. What it costs is latency on that one
call, and only while there is a backlog in front of it; what the caller sees is unchanged — its own
result, at the call site, not an `OfflineError` and not an `onReplay` callback.

**Across a reload the queue is gone, unless you ask for it.** By default it lives in memory — and
that is measured, not assumed: with the default, nothing at all is written to IndexedDB, so a
refresh, a crash or the tab closing loses whatever had not been sent. `persist: true` keeps it in
IndexedDB:

```ts
offlineMiddleware({ maxQueueSize: 50, persist: true });
```

Which one is right depends on what the queued write means. A draft the user can retype is fine in
memory; a signed timesheet is not.

**When the restored queue goes out** is worth stating exactly, because "on the next load" is not
quite it. A middleware has no way to send anything until a request gives it the rest of the chain,
so the backlog leaves on the **first call the app makes through that client** — a list being read,
a lookup, anything. Apps do that within a frame of loading, but if yours genuinely makes no request
until the user clicks something, the backlog waits for that click. It also goes out on the next
`online` event, whichever comes first.

That first call **waits for the backlog**, deliberately. The restored writes are older than it, and
FIFO across a reload is only a guarantee if the new request queues behind them rather than racing
past. So the first read after a reload costs whatever the user's offline stretch accumulated — and
only then.

Two things that will bite, and neither is a bug to be fixed:

- **a replay meets a server that has moved on.** The requests were built minutes or hours ago, and
  the record may have changed since — or may no longer exist. `onReplay` is the callback where you
  find out what the server said, and it is the place to decide whether a 409 is a conflict to show
  or a write to drop. **A replayed request that fails is not re-queued** — it is handed to
  `onReplay` and dropped, so retrying is a decision you make rather than one the queue makes for
  you;
- **a queued call has already returned.** It rejected with `OfflineError` at the time, so whatever
  the caller did with that rejection has happened: the eventual success arrives with nobody
  awaiting it. Treat `OfflineError` as *accepted, not yet sent*, rather than as a failure.

One limit that is a bug and is tracked rather than hidden: a mutation issued **while a replay is
already in flight** goes straight out and can land before the older queued ones. It does not affect
the reload path, which waits, nor the reconnect path when the app is idle — only an app that writes
during the drain.

All of the above is measured against a real network drop rather than a redefined `navigator.onLine`:
`packages/responsive/tests/integration/ui-components/offline-queue.spec.ts` takes the network away
at the transport layer with Playwright and then asks the *server* what it received.

## Files: upload and download

A file is not a JSON body. It is large enough that the user wants to watch it move, and long enough
that they may want to stop it. `uploadFile` and `downloadFile` are the two that handle it, and both
return the same thing — a **`TransferHandle`**, whose progress is signals like everything else:

```ts
import { uploadFile } from '@pdxui/core';

const handle = uploadFile('/api/tickets/42/attachments', file, { fieldName: 'file' });
// handle.progress()  0-100      handle.loaded() / handle.total()  bytes
// handle.status()    'uploading' | 'done' | 'error'
// handle.abort()     stops it   handle.result                     a promise
```

```pdx
<pdx-progress :value="handle.progress" />
<pdx-button @click="handle.abort()">Cancel</pdx-button>
```

Because they are signals, a progress bar bound to `handle.progress` just moves — you are not writing
a callback that pokes at the DOM. `abort()` is a real cancel: the upload's request is aborted, not
merely ignored.

For the user-facing end of picking files — the drop zone, the file list, the size and type
rules — use [`<pdx-file-upload>`](https://pdxui.com/docs/components). It does **not** drive `uploadFile`: given an
`action` it uploads through an `XMLHttpRequest` of its own and hands you `pdx-progress` events, and
it never exposes a handle. So when you want the handle — a bar bound to a signal, a real `abort()`,
the bytes — leave `action` off and let the component do what it is best at (the picking and the
refusals, through `pdx-select` and `pdx-error`), then call `uploadFile` yourself:

```pdx
<pdx-file-upload accept=".pdf,.png" @pdx-select="onSelect" @pdx-error="onRejected" />
```

```ts
import { uploadFile, effect } from '@pdxui/core';

async function onSelect(e) {
  for (const file of e.detail.files) {
    const handle = uploadFile(`/api/attachments?name=${encodeURIComponent(file.name)}`, file);
    // A handle per transfer, so the template reads the panel's own signals, not the handle's:
    // rebinding a template to a new object is not something a binding can do.
    const stop = effect(() => { progress = handle.progress(); });
    try { await handle.result; } finally { stop(); }
  }
}
```

`packages/showcase/src/pages/ticket.pdx` is that panel, end to end — progress, cancel, a refused
file, and the download below.

### Saving what you downloaded

`downloadFile` resolves with a **`Blob`**, which is not yet a file on anyone's disk. `saveBlob` is
that last step, and it exists because the browser has no API for it — it takes an object URL, an
anchor that has to be *in* the document to work in Firefox, a click, the removal, and
`URL.revokeObjectURL`. Skip the last one and the blob is held for as long as the page is open.

```ts
import { downloadFile, saveBlob } from '@pdxui/core';

const handle = downloadFile('/api/tickets/42/attachments/7');
const blob = await handle.result;
saveBlob(blob, handle.filename() ?? 'attachment');
```

`handle.filename()` is **the name the server sent** — parsed from `Content-Disposition`, including
the `filename*=UTF-8''…` form, with any path stripped off. When the server names nothing it falls
back to the `filename` you passed in the options, and when nobody named it, it is `null`.

It is deliberately never the last segment of the URL. `/attachments/7` would save a file called `7`,
and a download named after a primary key is the kind of thing that looks fine in development and is
reported as a bug in the first week.

## Export: the rows, as a file

A grid of business data that cannot be exported is the most reliable complaint a line-of-business
application receives. `<pdx-data-grid show-toolbar>` has an **Export** menu — CSV or Excel — and
either file holds what the user is looking at:

- **the rows the filter and the sort select** — not the page. Somebody who narrowed 8000 rows down
  to 40 wants the 40, and `source.getAllRows()` is the trip that fetches them (the same `pageSize: 0`
  request `getAllIds()` makes);
- **a selection wins.** Four ticked rows and Export means four rows;
- **the columns on screen**, in their order, under the header the user reads, through each column's
  own `format` — so a coded value exports as «Closed» and not as `closed`.

The file is UTF-8 with a BOM (without it Excel shows accented text as mojibake) and CRLF line
endings, which is what RFC 4180 says.

The serialiser is public, for an export that is not a grid's:

```ts
import { toCsv, saveBlob } from '@pdxui/core';

const csv = toCsv(rows, [
  { field: 'reference', header: 'Ref' },
  { field: 'status', header: 'Status', format: (v) => t(`status.${v}`) },
]);
saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'export.csv');
```

`csvCell(value)` is one cell of it, and it is where the four rules live: a comma or a quote or a
newline is quoted (RFC 4180 doubles the quote), and a value STARTING with `=`, `+`, `-` or `@` is
prefixed with an apostrophe — `=HYPERLINK(...)` in a CSV is a formula the spreadsheet will run, and
that is how an export becomes an attack on whoever opens it. The value is kept, marked as text.

Excel is `toXlsx`, with the same arguments, and it returns the file itself:

```ts
import { toXlsx, saveBlob } from '@pdxui/core';

saveBlob(toXlsx(rows, columns), 'export.xlsx');
```

It needs no dependency: a workbook is six small XML parts in a ZIP, and the ZIP is stored rather
than compressed. What it adds over the CSV is **types** — a number is a number the spreadsheet can
sum, and a date (a `Date`, or an ISO `YYYY-MM-DD` string) is a date it can sort, shown in the
reader's own short-date format. Everything else goes through the column's `format`, as in the CSV.
No formula is ever written: a value starting with `=` is a text cell, by construction.

## Live data: a push from the server

A list that does not change when a colleague changes a record is the moment a business application
stops being believed. The framework ships **no socket client, on purpose** — the transport is your
decision, and a framework that picked one would be picking it for every application. What it ships
is the bridge, and the answer to what happens after it.

**The bridge.** `fromCallback(setup)` turns anything that calls you back — a WebSocket, an
`EventSource`, an SDK subscription — into a signal. `setup` returns the disposer, so the
subscription dies with the component:

```ts
import { fromCallback } from '@pdxui/core';

const lastEvent = fromCallback((emit) => {
    const socket = new WebSocket('wss://example.test/tickets');
    socket.onmessage = (m) => emit(JSON.parse(m.data));
    return () => socket.close();
});
```

**The other end.** A pushed change goes into the source with `applyServerChange`, and the choice of
method is the whole difference between a live list that is pleasant and one that is maddening:

```ts
$watch(lastEvent, (event) => {
    if (!event) return;
    const outcome = source.applyServerChange({ type: event.type, item: event.row });
    if (outcome === 'shadowed') notice = 'This record changed on the server while you were editing it.';
});
```

`applyServerChange` writes into the loaded page *underneath* the change set: it records nothing to
sync, sends nothing back, and **reloads nothing**. Reloading is what loses the selection, the scroll
offset and an open editor — so `refresh()` on every push is the mistake this exists to prevent.
`update()` is the opposite direction: it records what the *user* did, and putting a server push
through it tells the screen three untrue things — that there is unsaved work, that it should be sent
back to the server that just sent it, and that a rollback should restore the pre-push value, which
no longer exists anywhere.

It returns what it did:

| | |
|---|---|
| `applied` | it is on screen now |
| `shadowed` | the row has an **unsaved local edit**, so the user still sees theirs; the server's value is underneath, and a rollback will land on it. Tell them something arrived |
| `ignored` | it is not about this page — a row this page does not hold, or a creation the current filter excludes. The next read will pick it up if it belongs |

**Write through, or invalidate and refetch?** Write through for a change the server has already
described in full: it is one row, it is already here, and a refetch costs a round trip to learn what
the push just said. Refetch — `source.refresh()`, or `invalidate` for a `resource` — when what
changed is *unknown*, which is the reconnect case below.

**When the connection drops.** What happened while you were not listening is gone; a client that
pretends otherwise is worse than one that admits it. Two things, and both are the application's
job because only it knows what stale costs here:

1. **say so while it is down** — a list that claims to be live and silently stopped receiving is
   worse than one that never claimed;
2. **on reconnect, re-read** rather than guess. You do not know what you missed, so ask.

```ts
async function reconnect() {
    await source.refresh();     // what was missed is unknown: ask, do not guess
}
```

**A push racing an optimistic write.** The user is mid-sentence in a field and the same record
changes on the server. `applyServerChange` returns `shadowed` and keeps their edit in front of them
— yanking a field from under someone is the worse failure — while the server's value replaces the
`original` underneath, so `cancelChanges()` lands on what the server now says instead of restoring a
value nobody holds any more.

A worked screen with all five: `packages/showcase/src/pages/tickets.pdx`, with its feed in
`src/data/live.ts` and the measurements in `tests/live-data.spec.ts`.

## Long lists: when 50 000 rows are 15 elements

A grid renders one row element per row, and at some size that stops being viable — not because
rendering is slow but because the DOM is. **Virtualisation** renders only the rows the viewport can
show, plus a few above and below, and moves them as you scroll.

```pdx
<pdx-data-grid :source="rows" :columns="cols" virtual-scroll row-height="40" max-height="400" />
```

Measured on this repository's own harness
(`packages/responsive/tests/integration/ui-components/virtual-rows.spec.ts`): over 200 rows, over
5 000 and over **50 000**, the grid keeps **15 row elements** in the DOM. Two hundred and fifty
times the data, the same page. The scroll height still describes the whole set — 50 000 × 40px —
so row 49 000 is reachable; it is the DOM that is windowed, not the data.

**When you need it.** Not at 200 rows: a plain grid renders those in one pass and costs you
nothing, while virtualisation costs the three things below. The threshold is where the DOM starts
to be the bottleneck, which for a grid of a few columns is in the low thousands. Measure your own
case — the harness above is the shape of the measurement.

**What stops working when you turn it on.** Each of these is a real consequence, and better read
here than discovered:

- **Row height is fixed.** The grid's virtualisation places rows by number, so it sets every row
  to `row-height` (42 when unset) — the arithmetic that turns a scroll offset into a row index
  needs one height, not a measurement per row. A grid whose rows size themselves to their content
  is not a candidate. The reverse is guarded: `row-height` **without** `virtual-scroll` does
  nothing, and the component says so rather than letting you believe otherwise.
- **The browser's Ctrl+F finds only what is rendered.** Fifteen rows, not fifty thousand. If
  finding a row matters, the search has to be the grid's (a filter over the source), not the
  browser's.
- **Printing gets the window, not the table.** A print of a virtualised grid shows the rows that
  were on screen. Export the data instead — see *Export* below.
- **The row count a screen reader announces** is the number of rendered rows unless the grid says
  otherwise: check what your own set needs before promising accessibility over a windowed list.

**A list that is not a grid** — a card feed, a picker, anything with its own markup — uses the
primitive directly. `<pdx-select>` is the library's own caller of it:

```ts
import { createVirtualizer } from '@pdxui/core';

const virt = createVirtualizer({
    count: () => rows().length,
    estimateSize: () => 40,          // per index: a guess is enough, see below
    getScrollElement: () => listEl,
    overscan: 3,                     // extra items above and below (the default)
    gap: 0,
    horizontal: false,               // true windows columns instead of rows
});

virt.items();          // the visible slice, reactive: { index, start, size } each
virt.totalSize();      // the height the inner spacer needs, in px
virt.scrollTo(4_200, { align: 'center' });
virt.measureElement(el);   // hand it a rendered row and its real size replaces the estimate
virt.dispose();
```

**The honest limits.** `estimateSize` is a guess and `measureElement` is how it stops being one:
the virtualizer keeps three tiers — estimated, then measured from a `ResizeObserver` on what was
actually rendered — so variable heights work *if you call `measureElement`*, and jump slightly if
you do not. **Horizontal virtualisation is the same code with `horizontal: true`**, and windows one
axis: a grid with both thousands of rows and hundreds of columns is not something this handles
today. And `dispose()` is not optional — the observer and the scroll listener outlive the component
that made them.

## The primitives underneath

`@fetch` is a declaration over `resource()`, and the same is true one level up: the data-bound
components take a **DataSource**, and `createDataSource` is how you make one.

```ts
import { createDataSource } from '@pdxui/core';

const users = createDataSource(rows);                       // an array: everything client-side
const orders = createDataSource({ transport: myTransport }); // a server: the same API
```

```pdx
<pdx-data-grid :source="users" :columns="cols" />
```

That symmetry is the point, and it is the reason to reach for it rather than for a plain array: a
grid built against `createDataSource(rows)` does not change when the data outgrows the browser — the
paging, sorting, filtering and grouping descriptors go to the transport instead of running locally.
`data()`, `total()`, `loading()` and `error()` are signals, so the template follows a page or sort
change without being told to. `<pdx-data-grid>`, `<pdx-entity-grid>`, `<pdx-list>` and `<pdx-select>`
all take one.

Below `@fetch` there is a `resource`, and two shapes of it are worth knowing by name:

- **`httpResource(url, options)`** — a resource over the configured `HttpClient`, where `url` may
  be a **function** and `params` a signal-returning one. Read either inside the fetcher and the
  resource refetches when they change: that is how a filter or a page number drives a request
  without an effect written by hand.
- **`resourceWhen(res, handlers)`** — renders a resource's states as a fragment, so a template
  branches on them without a chain of `@if`s. The handlers are `loading`, `success(data)`,
  `error(err, retry)` — the retry is handed to you, so the error branch can offer it —
  plus `stale(data)` and `reloading(data)`, which are the two that let a refetch keep the old data
  on screen instead of flashing a spinner over it.

Two more you will meet rarely and should know exist:

- **`createHttpClient(config)`** — a second, independent client. `configureClient` sets up *the*
  client that `@fetch` and `getDefaultClient()` use; make your own when a subsystem needs a different
  base URL, headers or middleware chain, and keep the shared one for everything else.
- **`createCache(config)`** — the store behind the resources. `getDefaultCache()` is created on first
  use, so most applications never call this; an isolated subsystem, or a test that must not share
  state with another, is the reason it is exported. **`setDefaultCache(cache)`** replaces the
  process-wide one — for a test, or for setup code that wants different staleness or size limits.
  Call it **before** creating resources: anything already holding the previous cache keeps it.

## In practice

- **Read data** → `@fetch name: 'GET /url'` and use `name.loading/error/data`.
- **Feed a grid or a select** → `createDataSource(rows)` or `createDataSource({ transport })`.
- **Depends on state** → put `${signal}` in the URL: it re-runs itself.
- **Avoid duplicate requests** → `staleTime` + `tags`.
- **After a write** → `mutate(..., { invalidates: [...] })`: the lists refresh.
