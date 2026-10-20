# Data

How a component reads, writes and holds data. In the beta every asynchronous source speaks **one
vocabulary**, so a template written against one works against the others.

## The async vocabulary

### Semantics

Owner decision of 2026-10-10 (#141 — **landed** for `resource()`, `@fetch`, `useQuery` and
`mutation()`; a route loader's states take these words, and its named object with `data()` … `stale()`
is #146's). A resource (`@fetch`, `resource()`), `useQuery`, a mutation (`mutation()`, `@action`) and a
route loader (`@loader`) all expose:

| Member | Meaning |
|---|---|
| `data(): T \| undefined` | the last successful value (a mutation: its last result) |
| `error(): Error \| null` | the last error, cleared by the next success |
| `state(): 'idle' \| 'pending' \| 'success' \| 'error'` | where the source is |
| `pending(): boolean` | any request in flight, first load or refresh |
| `stale(): boolean` | resource, `useQuery` and route loader (not a mutation or an action): the data shown is no longer known to be current |

A refresh with data is `state() === 'success' && pending()`. An optimistic value is `data()` until
the request settles.

**`stale()`, precisely** — one definition for the three sources that cache:

| Situation | `data()` | `stale()` | `state()` |
|---|---|---|---|
| never loaded, or first load in flight | `undefined` | `false` | `'idle'` / `'pending'` |
| loaded, younger than `staleTime`, not invalidated | the value | `false` | `'success'` |
| loaded, older than `staleTime` (with `staleTime: 0`, as soon as a consumer mounts on the key or selects it again) | the kept value | `true` | `'success'` |
| invalidated (an `invalidate` that matches it) | the kept value | `true` | `'success'` |
| refreshing a stale or invalidated value | the kept value | `true` until the new value arrives | `'success'`, `pending()` true |
| refreshing a fresh value (`refetch()` by hand) | the kept value | `false` | `'success'`, `pending()` true |
| a refresh failed, a value was kept | the kept value | `true` | `'error'` |
| refreshing again after a failed refresh | the kept value | `true` | `'error'`, `pending()` true |
| a first load failed | `undefined` | `false` | `'error'` |
| a failed first load waiting for or running its retry | `undefined` | `false` | `'pending'` |

A new success sets `stale()` to `false`, clears `error()` and restarts the `staleTime` clock;
nothing else clears `error()` — a request starting does not (**landed**, #141; alpha cleared it at
the start). A retry is part of its request: while it waits or runs, `pending()` is true and
`state()` is the row's. The source's actions stay on it: `refetch()`, `abort()`, `mutate(value)` on a
resource; `execute(arg)`, `cancel()` on an action.

### Rules

- The alpha names — `loading`, `isPending`, `status`, `isLoading`, the extra `state` values
  (`loading`, `reloading`, `stale`, `local`), `currentLoaderState()` — are removed, `PDX_REMOVED_FORM`
  (decisions.md 36).
  `pdx migrate` rewrites the mechanical ones (`x.isPending()` → `x.pending()`) and flags the others
  (`x.loading()` is `x.state() === 'pending' && !x.data()`, #141 — **landed**: entries
  `async-is-pending`, `async-alpha-names`, read where the file declares the source; a loader's
  `'loading'`/`'done'` compared in a file are rewritten to `'pending'`/`'success'`,
  `loader-state-words`; `currentLoaderState()` itself is #146's).

### Since

beta (#141)

## The execution contract

The vocabulary says what a source *shows*; this section says what it *does* when requests overlap,
fail, are cancelled or outlive their consumer. It holds for every source that reads — `@fetch`,
`resource()`, `useQuery`, a route loader — and, where it says so, for an `@action`. It adds **no
syntax**: it is the set of rules the runtime keeps and the acceptance cases that hold it to them.
Every rule is **proposed** (decisions.md, point 23) unless it says **landed**; where the runtime
differs today, the difference is stated, with the line that shows it (read on 2026-10-11).

| # | Rule | Today |
|---|---|---|
| E1 | **Latest wins.** A response for a request that is no longer the current one for its source — the key changed, or a newer request started — writes nothing: not `data()`, not `error()`, not `state()`, not the cache. | **landed** for `resource()`: a generation counter (`core/src/reactivity/resource.ts:172,216-217,234-235`), checked before `cache.set` |
| E2 | **Cancellation reaches the transport.** Each request has an `AbortSignal`; `@fetch` passes it to the HTTP client, `resource(fetcher)` passes `{ signal }` to the fetcher. A request that is superseded (E1), cancelled or disposed is aborted on the network, not only ignored. | differs: `fetcher()` is called with no argument (`resource.ts:213`), `@fetch` emits `__httpClient.get(url)` with no signal; the client accepts one (`core/src/http/types.ts:75`) |
| E3 | **Cancelling is not failing.** `abort()` / `cancel()` returns the source to its last settled state — `'success'` with the kept data, or `'idle'` — and leaves `error()` as it was. A cancellation never becomes `error()`. A transport **timeout** is a failure, not a cancellation: the client raises a distinct `HttpTimeoutError` for it (from the abort's `reason`), and that one becomes `error()`. | differs: `abort()` aborts and clears the controller without touching the state (`resource.ts:340-345`), so a source stays pending; the client turns every abort, its own timeout included, into one `AbortError` (`core/src/http/client.ts:133-134`), so the two cannot be told apart |
| E4 | **A failed refresh keeps the data.** `state()` becomes `'error'`, `data()` keeps the last value, `stale()` is `true`, `pending()` is `false` — the `stale()` table above. The template keeps the body and may show the error beside it (`@await`, template.md). | **landed** (#141) for `resource()`, `@fetch` and `useQuery`, in `core/tests/async-contract.test.ts`; `resourceWhen` keeps its success branch; `@await` keeps its body (#145, case 4's template leg in the same suite) |
| E5 | **Absence is `undefined`; `null`, `0`, `false` and `''` are data.** Whether there is a result is `state()`, not the value's truthiness: a source that resolved `null` is `'success'`, and `@await` renders its body. A fetcher that resolves `undefined` settles `'success'` with no data; in development it warns once (return `null` to say «nothing»). | **landed** for the sentinel, and for `resourceWhen` (#141: a success renders its branch whatever the value, `undefined` with a warning in development); and for `@await` (#145): it decides by the source's `state()` and a promise's settling, and a plain `null`, `0` or `''` renders the body (`core/src/renderer/await.ts`, `core/tests/await-block.test.ts`) |
| E6 | **One layer retries, and only reads.** A read source retries on a network failure, a 5xx, a 408 or a 429 (honouring `Retry-After`), with exponential backoff and jitter; while it waits, `pending()` is true and `state()` is what the table above gives; `cancel`/`dispose` stops the chain. Every request a read source makes goes out with the transport's retry **off** — the source's `retry` (0 for `resource()`, 3 for `useQuery`, as today) is the only one, so attempts do not multiply. **Writes are not retried implicitly**: the transport's default retry covers `GET`, `HEAD` and `OPTIONS` only; `PUT` and `DELETE`, idempotent by HTTP but not by every server, are retried only when a request asks for it. | partly: `mutation()` has no retry (**landed**), but the client retries every method it calls idempotent — `GET`, `HEAD`, `OPTIONS`, **`PUT`, `DELETE`** (`core/src/http/middleware.ts:69,99`) — so an action that sends a `PUT` is retried by the transport; `useQuery` (3) on top of the client (3) can make 16 attempts; the resource backoff has no jitter (`resource.ts:238-244`) |
| E7 | **Concurrent reads of one key share one request.** A second consumer that asks for a key already in flight joins that request instead of starting another; every consumer of the key is notified when its value is written. The shared request is aborted only when its **last** consumer cancels or is disposed; one consumer's `abort()` detaches that consumer. One key has one request: a consumer's `refetch()` supersedes the shared request for every consumer (E1), and `mutate(value)` writes the key for all of them; a consumer whose key changes detaches from the old key's request. | differs: each resource fetches for itself (`resource.ts:191-193`) and writes the cache with `silent: true` (`resource.ts:222`), against `cache.ts:379-380`, which promises one request |
| E8 | **A read dies with its owner.** A read source created in a component's setup or a template scope is disposed with that scope: its request aborted (E2), its retry chain stopped, its cache subscription released. | differs: `resource()` registers no `onDispose` (`resource.ts:14`), and the compiler emits no dispose for `@fetch`, so a destroyed component's entries stay subscribed and are never collected; `useQuery` does (`use-query.ts:167`) |
| E9 | **Every cache is bounded.** The resource cache keeps at most `maxEntries` (LRU) and collects an unsubscribed entry after `gcTime` (**landed**: 200 and 5 min, `cache.ts:124-127`); a pinned entry is one that has a live consumer, which needs E8. Kept-alive route pages and `<component :is @keepAlive>` instances have a maximum and an LRU — lifecycle.md. | **landed** for route pages and `@keepAlive(n)` (#270): `<pdx-router-outlet keep-alive-max>`, default 10, LRU |

**Polling and refetch on focus / reconnect** (`useQuery`) never start a request while one is in
flight for the key — they join it (E7) — and **pause while their scope is suspended** — a frozen
route page — as well as while the document is hidden (lifecycle.md). Today only `refetchInterval`
skips a tick in flight (**landed**, `use-query.ts:134-136`); the focus and reconnect handlers call
`refetch()` unconditionally, which supersedes the request in flight (`use-query.ts:106,114`); and
the hidden-document pause applies only while `refetchOnFocus` is on (`use-query.ts:133`).

### Acceptance cases

One shared suite (`core/tests/async-contract.test.ts`, proposed) runs each case against
`resource()`, a compiled `@fetch`, `useQuery` and a loader:

1. Key A, then key B; A answers after B → `data()` is B's, the cache holds nothing for A from that
   request, no flicker through A.
2. Superseded, cancelled or disposed request → its `AbortSignal` is aborted (observed by the fake
   transport).
3. `abort()` during a first load → `'idle'`, `error()` `null`; during a refresh → `'success'`, data
   kept; a transport timeout → `'error'` with an `HttpTimeoutError`.
4. A refresh fails → `'error'`, data kept, `stale()` true, `pending()` false; `@await` keeps the body.
5. A fetcher resolves `null`, `0`, `false` → `'success'`, body rendered with that value.
6. A read that fails twice then succeeds with `retry: 2` → three transport calls (not twelve, as
   a source retry on top of the client's would make); an action whose `PUT` fails → one call.
7. Two components mount with the same key → one transport call, both receive the value; the first
   unmounts → the request goes on; the second unmounts → it is aborted. One consumer's `refetch()`
   during the request → one new request, both consumers receive its value.
8. A component with `@fetch` is destroyed → its cache subscription count returns to zero and the
   entry is collected after `gcTime`.

## @fetch — unchanged, landed fixes, one addition

### Syntax

```ebnf
FetchDecl ::= "@fetch" S Word S? ":" S? FetchSpec ( S "as" S Type )? ( S? FetchOptions )? End
FetchSpec ::= Quote Method " " Url Quote      /* a Method other than GET is PDX_FETCH_METHOD */
```

### Semantics

Unchanged from alpha: a read, compiled to `resource()`, typed by `as`, cached by key. A URL that
interpolates a signal or a prop refetches when it changes, and the options are rewritten like the
rest of the script (#101, #203 — landed). The resource speaks the async vocabulary.

### Rules

As alpha: `PDX_FETCH_INVALID`, `PDX_FETCH_METHOD` (a write is an `@action`), `PDX_FETCH_TYPE_COLON`,
`PDX_FETCH_UNKNOWN_OPTION`, `PDX_FETCH_NO_ERROR_UI` (info).

### Since

alpha

## @action

**`invalidate` takes tags.** An array passed to `invalidate` lists cache **tags**, as the runtime has
always documented (`core/src/reactivity/cache.ts`); a `@fetch` tags its resource with its own key
(`GET:/url`), generated by the compiler (#282, decisions.md 47), so `invalidate: ['GET:/api/users']`
reaches every `@fetch` of that URL. A route loader is tagged `loader:<pattern>` (#148).

### Syntax

```ebnf
ActionDecl    ::= "@action" S Identifier S? "(" S? ActionParams? S? ")"
                  ( S "when" S Expression )? ( S "with" S? ActionOptions )? S? "{" Statement* "}"
ActionParams  ::= Identifier ( S? ":" S? Type )? ( S? "," S? "{" S? "signal" S? "}" )?
                | "{" S? "signal" S? "}"
ActionOptions ::= "{" S? ActionOption ( S? "," S? ActionOption )* ( S? "," )? S? "}"
ActionOption  ::= ( "invalidate" | "optimistic" | "onSuccess" | "onError" ) S? ":" S? Expression
                | "concurrency" S? ":" S? Quote ( "queue" | "drop" | "coalesce" | "parallel" ) Quote   /* proposed */
                | "agent" S? ":" S? StringLiteral | "consequential" S? ":" S? ( "true" | "false" )    /* proposed: agents.md */
```

### Semantics

A declared **write**, the counterpart of `@fetch` (#142; the name `action` was decided on 2026-10-10,
leaving `command` to the native attribute). It compiles to `mutation()`:

- the first parameter is the argument of `execute(arg)`; the optional last parameter, written as the
  destructuring `{ signal }`, receives an `AbortSignal` per call, aborted by `name.cancel()` — never
  implicit;
- `when <expr>` is a `$derived` exposed as `name.enabled()`;
- `with { … }` passes `invalidate`, `optimistic`, `onSuccess`, `onError` to `mutation()`;
- a call while another is pending is **queued** and runs after it (#50 — landed).

**Concurrency** (proposed, decisions.md point 24). What a call does while another is pending is one
option, `concurrency`, because the right answer depends on what the write is:

| `concurrency` | A call while one is pending | For |
|---|---|---|
| `'queue'` (default) | runs after it, in call order; a rejection does not stop the next (**landed**, `core/src/reactivity/mutation.ts:85-101`) | ordered writes: a list of edits |
| `'drop'` | is ignored; `execute()` returns the pending call's promise | a submit: a second click must not send twice |
| `'coalesce'` | replaces any call **waiting** behind the running one; the running one is not touched | autosave: only the latest draft needs to reach the server |
| `'parallel'` | runs at once; `data()` and `error()` are those of the last call **to settle** | independent writes: toggling several rows |

**Aborting the running write is never a policy.** A write the server may already have applied is not
taken back by aborting the request; `cancel()` stays the explicit way to stop one, and `{ signal }`
is how the body honours it. In every mode, `pending()` is true while any call runs or waits,
`optimistic` is applied when a call **starts** (not when it is queued) and rolled back if that call
fails, and `invalidate` runs after each success. A coalesced call settles with the call that
replaced it.

- **Rollback under `'parallel'`** restores only what the failing call changed: each call's optimistic
  value is an overlay, and removing one leaves later overlays in place. (Today rollback restores a
  whole snapshot, `core/src/reactivity/mutation.ts:153-155`, which under parallel calls would
  overwrite a later optimistic value.)
- **`cancel()`** aborts the running call's `signal` and removes every call waiting behind it; their
  promises reject with an `AbortError`, and none of them becomes `error()` (E3).
- A waiting call whose `when` has become false when its turn comes **is not run**; its promise rejects
  with an `ActionDisabledError`.
- `<pdx-button :action>` follows the policy: under `'drop'` and `'queue'` it is `loading` and refuses
  clicks while the action is pending (the landed behaviour, #49); under `'coalesce'` and `'parallel'`
  it stays clickable and shows `loading` while any call runs.

The result is an **action**: `execute(arg?)`, `pending()`, `enabled()`, `cancel()`, plus the async
vocabulary. `<pdx-button :action="save" :action-arg="dto">` runs it on click, is `loading` and refuses
clicks while it is pending, and leaves a rejection on `save.error()` (#49 — landed).

### Rules

- `when` and `with` are keywords only in this position.
- An option not in the list is an error; the code name `PDX_ACTION_UNKNOWN_OPTION` is this
  specification's (#142 lists the options, not the check). A `concurrency` value not in the list is
  the same error.
- Acceptance cases (proposed): under `'parallel'`, call 1 and call 2 apply optimistic values and
  call 1 fails → call 2's value stays; `cancel()` with two calls waiting → both reject, `error()`
  unchanged; `when` turning false with a call waiting → that call does not run. Two `execute()` 10 ms apart under each policy — `'queue'` sends two
  in order, `'drop'` one, `'coalesce'` with three calls sends the first and the third, `'parallel'`
  two at once with `data()` from the later settlement; a call rejected under `'queue'` does not stop
  the next; an optimistic value queued behind another call is not visible until its call starts;
  no policy aborts the running call.

### Examples

```pdx
<template>
  <pdx-button :action="save" :action-arg="draft">Save</pdx-button>
  @if (save.pending()) { <pdx-button @click="save.cancel()">Cancel</pdx-button> }
  @if (save.error()) { <p>{{ save.error()?.message }}</p> }
</template>

<script>
import { api, type UserDto } from './api';
let draft = $signal<UserDto>({ name: '' });
const canSave = $derived(draft.name.length > 0);

@action save(dto: UserDto, { signal }) when canSave with { invalidate: ['GET:/api/users'] } {
  await api.save(dto, { signal });
}
</script>
```

### Since

beta (#142)

## @form

### Syntax

```ebnf
FormDecl ::= "@form" S Word S? ":" S? ( InlineSchema | Word ) ( S? FormOptions )? End
```

`InlineSchema` and `FormOptions` are the alpha grammar (`docs/language/data.md`), unchanged.

### Semantics

As alpha, with **explicit field binding** (#128). `@form f: Schema` exposes typed fields — `f.email`
with `value()`, `error()`, `touched()`, `dirty()` and `required` — and a control binds to one through
**its own model**: `::value="f.email"` on a text input, `::checked="f.accepted"` on a checkbox or a
switch, `::pressed="f.bold"` on a toggle — the model the control's manifest declares, as the alpha
form binding already distinguished (`codegen-form-binding.ts`, `checked` and `pressed` controls). The
binding writes the field, and the control receives the field's error, `aria-invalid` and `required`.
A field bound through a model whose type differs from the field's (`::checked` on a `string` field)
is a type error of the strict projection. `<pdx-form-field :field="f.email">` renders the field's label, hint and error. Parse errors
of `::value.number` land on the field. `required` lives in the schema only. A field named like a
form member — `valid`, `errors`, `reset`, `dirty`, `getValues`, `handleSubmit`, `array` — is
`PDX_FORM_FIELD_RESERVED` (error; decisions.md 13 — proposed): the compiler names the member and
asks for another field name.

### Rules

- The implicit wiring of alpha — a control with `name="x"` inside `<pdx-form :form="f">` — is a
  language change. `pdx migrate` reads the control's model from the manifest and writes
  `::<model>="f.x"` (`::checked` for `pdx-checkbox` and `pdx-switch`, `::pressed` for `pdx-toggle`,
  `::value` for the others); a control with no manifest entry, or with more than one model, is
  flagged. `name` on `pdx-form-field` becomes `:field`.
- `required` on the markup of a bound control: `PDX_FORM_REQUIRED_IN_MARKUP` (warning), pointing at
  the schema.
- The alpha rules stay (`PDX_FORM_FIELD_UNPARSED`, `PDX_FORM_ARRAY_RULES_IGNORED`,
  `PDX_FORM_UNKNOWN_RULE`, `PDX_FORM_NO_SUBMIT`).

**Asynchronous validation and submit** — rules, no syntax (proposed, decisions.md point 25). What
the form does today was read in `core/src/form/form.ts` on 2026-10-11.

| # | Rule | Today |
|---|---|---|
| F1 | An async validator's answer is written only if the field still holds the value it was asked about. | **landed** (`form.ts:364`, `591`) |
| F2 | A second submit while one is validating or submitting is dropped — the same rule as `concurrency: 'drop'`, applied by the form's submit handler (`handleSubmit(fn)`; the form does not need an `@action`), and the dropped submit resolves when the running one does. | **landed** (#279): the handler returns `Promise<void>`, and a dropped submit returns the running one's promise |
| F3 | Submit **flushes** first: a debounced async validation still waiting is run now, not abandoned, and submit waits for every async validation of the current values before deciding. | **landed** in effect: `validateAll` runs every async validator on the current values and awaits them (`form.ts:579-599`) |
| F4 | A value that changes **while submit is validating** stops that submit: it returns invalid, and the user submits again. Submit never sends a value it did not validate. | differs: the answer for the old value is skipped (`form.ts:591`) and does not count as an error, so the submit goes on and `getValues()` sends the new, unvalidated value |
| F5 | **Server field errors.** When the submit handler — `handleSubmit(fn)`, or an `@action` called inside it — rejects with field errors — RFC 9457 problem details with an `errors` map of field path → messages — each message lands on its field's `error()`; a path with no field lands on the form's error. A field's server error clears on its next edit. | **landed** (#280): matched as written, else ignoring case; the form's error is `formError()`; all clear when a submit starts; `submitError()` stays the raw rejection |
| F6 | A pending value from a `::x.debounce(ms)` binding (template.md, `::name`, #126) is written to its field before submit validates or reads the values. Acceptance: type, submit inside the debounce window → the submitted value is the typed one. | the modifier is beta (#126); nothing to flush today |
| F7 | The form's own autosave (`saveMode`, `saveDebounce`, grammar.md) is a write with the `'coalesce'` policy: a save waiting behind a running one is replaced by the newest values. | **landed** (#279): per field, one save in flight and at most one waiting, which starts with the newest value when the one in flight settles — for an `onFieldSave` callback that returns its save's promise; one returning nothing saves on every debounce |

### Examples

```pdx
<template>
  <pdx-form :form="signup">
    <pdx-form-field :field="signup.email">
      <pdx-input ::value="signup.email"></pdx-input>
    </pdx-form-field>
    <pdx-form-field :field="signup.age">
      <pdx-input type="number" ::value.number="signup.age"></pdx-input>
    </pdx-form-field>
  </pdx-form>
</template>

<script>
@form signup: {
  email: string { required, email },
  age?: number { min: 18 }
};
</script>
```

### Since

alpha → beta (#128)

## @store, $store — one rule added

```ebnf
StoreDecl ::= "@store" S Word ( S? "{" S? "persist" S? ":" S? ( "'" Word "'" | '"' Word '"' ) S? "}" )? End
StoreRune ::= RuneDecl                      /* with "$store"; its argument is required */
```

Unchanged from alpha: the file is the store, its actions are plain functions inside it, and a
component reads it with the generated hook (`const cart = useCart();`). `@store` is the one mechanism
for state shared by the whole app (the untyped bus has left the public API, #144 — landed). A `persist` value
other than `'local'` or `'session'` is `PDX_UNKNOWN_DECLARATION` in the beta grammar (alpha persisted
it to `sessionStorage` silently) — landed, #278 (decisions.md 14).
