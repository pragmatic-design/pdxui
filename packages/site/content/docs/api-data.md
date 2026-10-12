---
title: Data and HTTP API
description: "The HTTP client and its middleware, uploads, data sources and transports, the data grid model, CSV and XLSX export, and the auth store."
order: 24
parent: api
---

# Data and HTTP API

The HTTP client and its middleware, uploads, data sources and transports, the data grid model, CSV and XLSX export, and the auth store. 55 exports, from `@pdxui/core`.

Part of the [API reference](/docs/api), generated from the source by `packages/site/scripts/gen-api.mjs`.

## `AbortError`

```ts
import { AbortError } from '@pdxui/core';

class AbortError
```

Error thrown when the caller aborts a request — a cancellation, not a failure. A timeout is {@link HttpTimeoutError}.

## `actions`

```ts
import { actions } from '@pdxui/core';

function actions(list: CellAction[]): CellActionsSpec
```

Render a row of buttons in the cell — edit, delete, whatever the row affords.

Each action carries its own label, icon and handler, and receives the row when clicked. Buttons,
not links: these do something to the row rather than navigate, and the distinction is what a
keyboard and a screen reader go by.

## `aggregateColumn`

```ts
import { aggregateColumn } from '@pdxui/core';

function aggregateColumn(values: unknown[], spec: AggregateSpec): unknown
```

Compute a single aggregate over a column's raw values. Single source of truth used by both
per-group aggregates and the footer summary row. Handles the enum forms AND the function form,
normalizing the `'avg'` ↔ `'average'` alias (AggregateType uses `avg`, AggregateDescriptor uses
`average`). `count` counts all values (including null); numeric aggregates ignore null/NaN.

## `arrayTransport`

```ts
import { arrayTransport } from '@pdxui/core';

function arrayTransport(options: ArrayTransportOptions<T>): IDataTransport<T>
```

A {@link createDataSource} backend over an in-memory array: sorting, filtering, paging, grouping
and CRUD, all client-side.

It works on a COPY of the array it is given, so the caller's data is never mutated behind its
back. Use it when the whole dataset is already in the browser — a picker's options, a settings
table — and note the ceiling: everything is O(n) per operation, so a few thousand rows is the
point where a server-side transport earns its keep.

## `authMiddleware`

```ts
import { authMiddleware } from '@pdxui/core';

function authMiddleware(options: AuthMiddlewareOptions): HttpMiddleware
```

Attaches a credential header to every request, asking for the token per request rather than
holding one.

`getToken` is called on each request and may be async, which is what lets a token refresh happen
transparently: return the fresh token and the request carries it. Returning `null` sends the
request unauthenticated rather than failing it. Requests marked `meta.skipAuth` are skipped, so a
login or token-refresh call does not send the credential it is trying to obtain.

The token is never cached here and never appears in an error or a log — {@link logMiddleware}
redacts the header by name.

## `badge`

```ts
import { badge } from '@pdxui/core';

function badge(opts?: { tones?: Record<string, string>; tone?: string }): CellBadgeSpec
```

Render the cell as a badge, with a tone chosen per value.

`tones` maps the value to a tone name (`{ Active: 'success', Suspended: 'danger' }`); `tone` sets
one for every row. A value with no entry renders in the default tone rather than failing.

## `booleanIcon`

```ts
import { booleanIcon } from '@pdxui/core';

function booleanIcon(opts?: { trueLabel?: string; falseLabel?: string }): CellBooleanIconSpec
```

Render a boolean as a check or a cross, with an accessible label for each.

The labels are not decoration: an icon alone tells a screen reader nothing, so `trueLabel` /
`falseLabel` are what the cell actually announces.

## `clientGroup`

```ts
import { clientGroup } from '@pdxui/core';

function clientGroup(items: T[], groups: GroupDescriptor[]): GroupResult<T>[]
```

Group items by descriptors (recursive for multi-level).

## `clientSort`

```ts
import { clientSort } from '@pdxui/core';

function clientSort(items: T[], sort: SortDescriptor[]): T[]
```

Sort items by multiple fields (stable sort).

## `columnsToFormFields`

```ts
import { columnsToFormFields } from '@pdxui/core';

function columnsToFormFields(columns: ResolvedColumn[]): FormFieldSchema[]
```

Convert editable columns to form field schemas.

## `columnTypeToFormType`

```ts
import { columnTypeToFormType } from '@pdxui/core';

function columnTypeToFormType(colType: ColumnType | undefined): FormFieldType
```

Map column type to form field type.

## `computeDiff`

```ts
import { computeDiff } from '@pdxui/core';

function computeDiff(original: T, updated: T): Partial<T> | null
```

Compute the diff between original and updated. Returns null if identical.

## `configureClient`

```ts
import { configureClient } from '@pdxui/core';

function configureClient(config: HttpClientConfig): HttpClient
```

Configure and set the default HTTP client from config.

## `createAuthStore`

```ts
import { createAuthStore } from '@pdxui/core';

function createAuthStore(options?: AuthStoreOptions<TUser>): AuthStore<TUser>
```

Session state: the access and refresh tokens, the decoded user, and reactive `isAuthenticated`.

Tokens are attached only to trusted origins — same-origin, plus whatever `allowedOrigins` names.
That check is the point of the store: a bearer token appended to a URL that came from data is how
a credential leaves for someone else's server, and a store that attaches it to anything is one
redirect away from doing that.

`storageKey` persists across reloads, which trades the XSS exposure of anything in localStorage
for not asking the user to log in on every refresh; omit it to keep the session in memory only.
`decodeUser` turns claims into your own user type.

## `createDataSource`

```ts
import { createDataSource } from '@pdxui/core';

function createDataSource(arg: T[] | DataSourceOptions<T>): DataSource<T>
```

The reactive state behind a list: paging, sorting, filtering and grouping, over any transport.

Pass an array and it uses {@link arrayTransport} — everything client-side; pass a `transport` and
the same API sends the descriptors to a server instead. That symmetry is the point: a grid built
against an array does not change when the data outgrows the browser.

`data()`, `total()`, `loading()` and `error()` are signals, so a template re-renders on a page or
sort change without being told to.

## `createEditForm`

```ts
import { createEditForm } from '@pdxui/core';

function createEditForm(columns: ResolvedColumn[], row: Record<string, unknown>): Form<Record<string, unknown>>
```

Create a Form instance from grid columns + row data for editing.

## `createFormEngine`

```ts
import { createFormEngine } from '@pdxui/core';

function createFormEngine(): FormEngine
```

A form built from fields that register THEMSELVES, rather than from a schema declared up front.

The difference from {@link createForm}: there the field set is known when the form is created;
here each control registers on mount and unregisters on unmount, so the form's shape follows the
DOM. That is what a dynamic or generated form needs — `<pdx-auto-form>` builds on this.

Per-field state (value, errors, touched, validating) lives with the field; the engine aggregates.

## `createGridFromConfig`

```ts
import { createGridFromConfig } from '@pdxui/core';

function createGridFromConfig(config: DataGridConfig): GridFromConfig
```

Create a DataSource + ColumnDef[] + component props from a JSON config.

## `createHttpClient`

```ts
import { createHttpClient } from '@pdxui/core';

function createHttpClient(config: HttpClientConfig = {}): HttpClient
```

Build an HTTP client: a base URL, headers, a middleware chain and the request methods.

Two defaults are ON, because their absence is not a feature: a **30s timeout** (a request with no
deadline never settles — `loading` stays true forever and no error is produced) and **retry** for
idempotent methods. Both are overridable: `timeout: 0` disables the deadline, `retry: false` the
replay.

The chain order is deliberate and is the part worth knowing: retry sits OUTSIDE the caller's
middleware, so a retried attempt re-runs the whole chain (a refreshed token is picked up), and
INSIDE the timeout, which is applied per attempt — so a dead endpoint fails once at the deadline
instead of three times.

For one client shared across an app, see {@link configureClient} / {@link getDefaultClient}.

## `createOptionsSource`

```ts
import { createOptionsSource } from '@pdxui/core';

function createOptionsSource(loader: () => Promise<SelectOption[]>, options?: { cache?: boolean }): OptionsSource
```

Load a select's options once, cache them, and expose a `loading` signal while it happens.

The pattern every foreign-key or enum dropdown re-implements: fetch on first open, do not fetch
again, and do not fire a second request when the user opens the menu twice before the first
answers — concurrent calls share the in-flight promise rather than racing.

`reload()` forces a refetch, `peek()` reads the cache without triggering one, and `cache: false`
turns the whole thing into a plain loader for options that change per open.

## `csrfMiddleware`

```ts
import { csrfMiddleware } from '@pdxui/core';

function csrfMiddleware(options: CsrfMiddlewareOptions = {}): HttpMiddleware
```

Copies the CSRF token from its cookie into a request header, for state-changing requests only.

The cookie/header pair defaults to `XSRF-TOKEN` / `X-XSRF-TOKEN`, which is what most server
frameworks emit. GET, HEAD and OPTIONS are skipped because they are not supposed to change state;
a missing cookie sends the request unchanged rather than failing it, so a page loaded before the
session existed still works.

This is the browser half of double-submit CSRF protection — it is worth nothing unless the server
actually compares the two.

## `csvCell`

```ts
import { csvCell } from '@pdxui/core';

function csvCell(value: unknown): string
```

One value, escaped for a CSV cell.

The four rules, and why each is not optional:

  - a **comma** inside a value would start a new column, so the value is quoted. The first
    ticket titled "Printer, jammed" is the bug report;
  - a **quote** inside a quoted value ends it early: RFC 4180 escapes it by doubling it;
  - a **newline** would start a new row. Quoted, a line break is part of the value — which is
    what a note field contains;
  - a leading **`=`, `+`, `-` or `@`** is a FORMULA to a spreadsheet, and `=HYPERLINK(...)` or
    `=cmd|...` is how a CSV export becomes an attack on whoever opens it. The value is KEPT and
    prefixed with an apostrophe, which is how a spreadsheet is told "this is text" — dropping
    or rewriting the data would be a worse answer than showing it as what it is.

A `Date` becomes an ISO day: a CSV is read by a machine as often as by a person, and `9/20/2026`
is ambiguous in half the world. A column that wants it formatted passes a `format`.

## `currency`

```ts
import { currency } from '@pdxui/core';

function currency(opts?: { currency?: string; locale?: string }): CellCurrencySpec
```

Render the cell as a formatted amount, via `Intl.NumberFormat`.

Defaults to the document's locale and the currency you pass; omitting `currency` formats the
number without a symbol, which is what you want for a column whose unit is in the header.

## `dateCell`

```ts
import { dateCell } from '@pdxui/core';

function dateCell(opts?: { options?: Intl.DateTimeFormatOptions; locale?: string }): CellDateSpec
```

Render the cell as a formatted date, via `Intl.DateTimeFormat`.

Named `dateCell` rather than `date` because `date` is a word a consumer is likely to have already;
the other builders keep their obvious names.

## `delayTransport`

```ts
import { delayTransport } from '@pdxui/core';

function delayTransport(options: DelayTransportOptions<T>): IDataTransport<T>
```

Wrap any transport with artificial delay for loading state demos/testing.

## `downloadFile`

```ts
import { downloadFile } from '@pdxui/core';

function downloadFile(url: string, options?: DownloadOptions): DownloadHandle
```

Download a file with reactive progress tracking.
Uses fetch + ReadableStream for download progress.
Requires server to send Content-Length header for percentage.

Usage:
  const handle = downloadFile('/api/export/report.pdf');
  effect(() => console.log(`${handle.progress()}%`));
  const blob = await handle.result;

## `fakeTransport`

```ts
import { fakeTransport } from '@pdxui/core';

function fakeTransport(options: FakeTransportOptions<T>): IDataTransport<T> & { /** Access the internal data for assertions. */ getData(): Promise<T[]> }
```

{@link arrayTransport} with a simulated network in front: latency, jitter and a configurable error
rate.

For demos and for tests of the states a real backend produces and an in-memory one never does — a
visible loading spinner, an error branch, a race between two requests. `errorRate: 0.1` fails one
call in ten, which is how you find out whether the error path was ever written.

`onOperation` and `getData()` are the test surface: what was asked, and what the store holds now.

## `getDefaultClient`

```ts
import { getDefaultClient } from '@pdxui/core';

function getDefaultClient(): HttpClient
```

Get the default HTTP client. Creates one with empty config if not set.

## `getFieldValue`

```ts
import { getFieldValue } from '@pdxui/core';

function getFieldValue(row: unknown, field: string): unknown
```

Get a nested property value via dotted path.

## `HttpError`

```ts
import { HttpError } from '@pdxui/core';

class HttpError
```

The error every non-2xx response becomes.

It carries the status, so calling code branches on `err.status === 404` rather than parsing a
message, and the parsed body, so a validation error from the server is available without a second
read of a stream that has already been consumed.

Distinct from {@link HttpTimeoutError} (the server did not answer in time), {@link AbortError}
(the caller cancelled) and {@link OfflineError} (it was never sent). {@link retryMiddleware} tells
them apart for exactly this reason: a 503 is worth repeating, a cancellation is not.

## `HttpTimeoutError`

```ts
import { HttpTimeoutError } from '@pdxui/core';

class HttpTimeoutError
```

Error thrown when a request outlives the client's `timeout`: the server did not answer in time. A
failure, not a cancellation — an `AbortError` is what the caller's own abort produces — and not
replayed by the retry middleware.

## `humanizeField`

```ts
import { humanizeField } from '@pdxui/core';

function humanizeField(field: string): string
```

Humanize a field name: 'firstName' → 'First Name', 'address.city' → 'City'.

## `isDataSource`

```ts
import { isDataSource } from '@pdxui/core';

function isDataSource(value: unknown): value is DataSource<T & Record<string, unknown>>
```

Type guard: check if a value is a DataSource instance.

## `link`

```ts
import { link } from '@pdxui/core';

function link(opts: { href: (value: unknown, row: CellRow) => string; text?: (value: unknown, row: CellRow) => string; target?: string }): CellLinkSpec
```

Render the cell as an anchor, with the href computed from the value and the whole row.

`href` gets the row too, because the target is usually built from an id the cell does not show.
The URL is sanitised before it reaches the DOM, so a `javascript:` value coming back from a server
does not become a link that runs it.

## `logMiddleware`

```ts
import { logMiddleware } from '@pdxui/core';

function logMiddleware(options: LogMiddlewareOptions = {}): HttpMiddleware
```

Logs each request and its outcome with the elapsed time, for development.

Header VALUES whose name looks like a credential — authorization, cookie, api-key, token, secret —
are replaced with `[REDACTED]`, so turning logging on cannot leak a bearer token into a console
someone screenshots. Errors are logged and re-thrown, never swallowed.

Add it deliberately: it is not in the default chain, and a production build should not include it.

## `mapOptions`

```ts
import { mapOptions } from '@pdxui/core';

function mapOptions(records: T[], labelField = 'label', valueField = 'value'): SelectOption[]
```

Map raw records to {label, value} options via field names (keeps the source row under `_raw`).

## `matchesFilters`

```ts
import { matchesFilters } from '@pdxui/core';

function matchesFilters(item: T, filters: (FilterDescriptor | CompositeFilter)[]): boolean
```

Match an array of filters (all must pass = implicit AND).

## `OfflineError`

```ts
import { OfflineError } from '@pdxui/core';

class OfflineError
```

Error thrown when the device is offline and the request cannot be queued.

## `offlineMiddleware`

```ts
import { offlineMiddleware } from '@pdxui/core';

function offlineMiddleware(options: OfflineMiddlewareOptions = {}): HttpMiddleware
```

Queues mutations made while offline and replays them, in order, on reconnect.

Only POST/PUT/PATCH/DELETE are queued: a GET fails fast so the cache can answer it instead of
being replayed later against a page that has moved on. Replay is sequential FIFO, because the
order of two writes to the same record is the difference between the right value and the wrong
one.

The queue is capped (50 by default) and drops the OLDEST when full — bounded memory beats a
complete history, and a request from an hour ago is the one most likely to conflict. Requests are
deep-cloned on the way in, so a caller mutating its own object afterwards cannot change what gets
replayed. `persist: true` survives a reload via IndexedDB.

Replayed requests carry their ORIGINAL headers, including a bearer token that may have expired by
the time they are sent. `onReplay` is where you find out.

## `opsForType`

```ts
import { opsForType } from '@pdxui/core';

function opsForType(type: FieldType | undefined): FilterOperator[]
```

The filter operators that make sense for a field type — what a filter builder should offer.

The distinctions are deliberate: text gets `contains`/`startswith`, numbers and dates get the
comparisons plus `between`, dates ALSO get the relative presets (`today`, `last7days`) which carry
no value because they are a range against now, and enums get set membership (`in`/`notin`) rather
than text matching — an enum is chosen from a list, not typed.

An unknown type falls back to the text set, which is the widest and least wrong.

## `RELATIVE_DATE_OPS`

```ts
import { RELATIVE_DATE_OPS } from '@pdxui/core';

const RELATIVE_DATE_OPS: FilterOperator[]
```

Relative date presets — a range relative to "now", carrying no value of its own.

## `restTransport`

```ts
import { restTransport } from '@pdxui/core';

function restTransport(options: RestTransportOptions<T>): IDataTransport<T>
```

A {@link createDataSource} backend that talks to a REST API: paging, sorting, filtering and CRUD
over `fetch`.

The two hooks that matter are `parameterMap`, which turns the grid's descriptors into whatever
query string your server expects, and `parseResponse`, which reads its answer. Without them it
assumes the common convention — `{ data, total }`, or a bare array with `total: -1` meaning
unknown — and that convention is the only thing to change when a server disagrees.

`total: -1` is not an error: it means the server did not say how many rows exist, and the grid
shows a next-page control instead of a page count.

## `retryMiddleware`

```ts
import { retryMiddleware } from '@pdxui/core';

function retryMiddleware(options: RetryMiddlewareOptions = {}): HttpMiddleware
```

Retries a failed request with exponential backoff and jitter.

Retries only what retrying can fix: 5xx, 408 and 429, plus network errors. A 4xx is the server
saying the request itself is wrong, and repeating it changes nothing; a cancel or a timeout is not
retried either. A read source's own `retry` (`resource()`, `useQuery`) follows the same rule.

By default it retries only the methods that READ (GET, HEAD, OPTIONS): a write that failed may well
have been applied — replaying a POST can charge a card twice, and a PUT or DELETE is idempotent only
if the server made it so. A request that should be retried says so itself, `retry: 2` in its
options; `retry: false` turns the retry off for one request (a read source does, owning its own).

On by default in {@link createHttpClient}; pass `retry: false` there to turn it off.

## `rowMenu`

```ts
import { rowMenu } from '@pdxui/core';

function rowMenu(opts: { items: RowMenuItem[]; label?: string | ((row: CellRow) => string); icon?: string }): CellRowMenuSpec
```

Render the cell as ONE control that opens the row's menu.

The other shape of {@link actions}, and the one to reach for past two entries: a row of four icon
buttons is the whole width of a 390px phone, and the actions a single record has and a selection
does not — duplicate, print, open in a new tab — have nowhere else to live. The trigger says
`aria-haspopup="menu"`, the menu is the grid's own (arrows, type-ahead, Escape back to the
trigger), and a click on either never reaches the row underneath.

## `saveBlob`

```ts
import { saveBlob } from '@pdxui/core';

function saveBlob(blob: Blob, filename: string): void
```

Save a Blob as a file the user has.

The browser has no API for this: it takes an object URL, an anchor that must be IN the document
to be clickable in Firefox, a click, the removal, and `revokeObjectURL` — which is the step that
gets forgotten, and forgetting it holds the blob for the life of the document.

Usage:
  const handle = downloadFile('/api/export/7');
  saveBlob(await handle.result, handle.filename() ?? 'export.csv');

## `setDefaultClient`

```ts
import { setDefaultClient } from '@pdxui/core';

function setDefaultClient(client: HttpClient): void
```

Set the default HTTP client (called once during app init).

## `status`

```ts
import { status } from '@pdxui/core';

function status(opts?: { tones?: Record<string, string>; tone?: string }): CellStatusSpec
```

Render the cell as a status indicator — a dot and a label — with the same tone mapping as
{@link badge}.

Reach for this when the value IS the state of the row (active, failed, pending); {@link badge} is
for a label that happens to be coloured, like a category or a tier.

## `timeoutMiddleware`

```ts
import { timeoutMiddleware } from '@pdxui/core';

function timeoutMiddleware(ms: number): HttpMiddleware
```

Gives requests a deadline by writing it into `meta._timeout`, which the client turns into an
AbortController.

Prefer `createHttpClient({ timeout })`, which is the same deadline expressed where the reader
looks for it — this exists for the case where different middleware layers need different
deadlines. It does NOT override a request that already carries one.

A request with no deadline never settles: `loading` stays true and no error is ever produced, so
the component shows its skeleton for as long as the tab is open. That is why the default client
sets 30s.

## `toColumnDefs`

```ts
import { toColumnDefs } from '@pdxui/core';

function toColumnDefs(fields: FieldDefinition[]): ColumnDef[]
```

Convert FieldDefinition[] → ColumnDef[] for pdx-data-grid.

## `toCsv`

```ts
import { toCsv } from '@pdxui/core';

function toCsv(rows: readonly Record<string, unknown>[], columns: readonly CsvColumn[]): string
```

The rows, as the bytes of a CSV file.

A BOM first, because without it Excel decodes UTF-8 as its local code page and the first
accented name arrives as mojibake — the complaint that follows every first CSV export. Lines end
with CRLF, which is what RFC 4180 says and what Excel expects.

What is NOT decided here: WHICH rows. That is the caller's, and it is the important half — a
user who filtered 8000 rows down to 40 wants those 40, and a selection wins over the filter.

## `toFilterFields`

```ts
import { toFilterFields } from '@pdxui/core';

function toFilterFields(fields: FieldDefinition[]): FilterField[]
```

Convert FieldDefinition[] → FilterField[] for pdx-filter-builder.

## `toFormFields`

```ts
import { toFormFields } from '@pdxui/core';

function toFormFields(fields: FieldDefinition[]): FormFieldSchema[]
```

Convert FieldDefinition[] → FormFieldSchema[] for pdx-auto-form / pdx-form-template.

## `toXlsx`

```ts
import { toXlsx } from '@pdxui/core';

function toXlsx(rows: readonly Record<string, unknown>[], columns: readonly XlsxColumn[]): Blob
```

The rows, as an Excel workbook: one sheet, the header in bold, numbers and dates typed, the rest
as the column's `format` shows it.

Which rows is the caller's, as for `toCsv`: the selection when there is one, otherwise what the
filter selects.

## `uploadFile`

```ts
import { uploadFile } from '@pdxui/core';

function uploadFile(url: string, file: File | Blob, options?: UploadOptions): TransferHandle
```

Upload a file with reactive progress tracking.
Uses XMLHttpRequest for upload.onprogress events (fetch doesn't support this).

Usage:
  const handle = uploadFile('/api/upload', myFile, { fieldName: 'avatar' });
  effect(() => console.log(`${handle.progress()}%`));
  const response = await handle.result;

## `useDataGrid`

```ts
import { useDataGrid } from '@pdxui/core';

function useDataGrid(options: DataGridOptions<T>): DataGrid<T>
```

Everything a data grid needs that is not markup: column state (width, order, visibility), sorting,
selection, editing and the {@link createDataSource} underneath.

Headless on purpose — it owns the state and the rules, `<pdx-data-grid>` owns the DOM — so the
same behaviour is testable without rendering and reusable by a component that looks nothing like a
table.

Column GROUPS render as a multi-row header, but sorting, widths and order operate on the flat leaf
list; the grid flattens them for you and keeps the parent on each leaf. Two levels, no more.
