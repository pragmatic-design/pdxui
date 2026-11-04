# Data declarations

The declarations that bring data into a component or share it between components: `@fetch` reads
from a server, `@form` holds what a user enters, `@store` makes a file a store shared by the whole
app, and `$store` is a deep reactive object. Each one is a statement of a `<script>`
([script.md](script.md)) that the analyzer reads line by line, starting at the beginning of the line.

## The async vocabulary and its execution contract

Every asynchronous source speaks **one vocabulary** (#141), so a template written against one works
against the others: a resource (`@fetch`, `resource()`), `useQuery`, a mutation (`mutation()`,
`@action`) and a route loader (`@loader`) all expose

| Member | Meaning |
|---|---|
| `data(): T \| undefined` | the last successful value (a mutation: its last result) |
| `error(): Error \| null` | the last error, cleared by the next success |
| `state(): 'idle' \| 'pending' \| 'success' \| 'error'` | where the source is |
| `pending(): boolean` | any request in flight, first load or refresh |
| `stale(): boolean` | resource, `useQuery` and route loader (not a mutation or an action): the data shown is no longer known to be current |

A refresh with data is `state() === 'success' && pending()`. An optimistic value is `data()` until
the request settles. `stale()`, for the three sources that cache:

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

A new success sets `stale()` to `false`, clears `error()` and restarts the `staleTime` clock; nothing
else clears `error()`, and a request starting does not. A retry is part of its request: while it waits
or runs, `pending()` is true and `state()` is the row's. The alpha names (`loading`, `isPending`,
`status`, `isLoading`, the extra `state` values) are removed forms ([migration.md](migration.md)).

The vocabulary says what a source shows; the **execution contract** says what it does when requests
overlap, fail, are cancelled or outlive their consumer. It holds for every source that reads, and
where it says so for an `@action`. It adds no syntax.

| # | Rule | |
|---|---|---|
| E1 | **Latest wins.** A response for a request that is no longer the current one for its source — the key changed, or a newer request started — writes nothing: not `data()`, not `error()`, not `state()`, not the cache. | alpha (a generation per request, `resource.ts`) |
| E2 | **Cancellation reaches the transport.** Each request has an `AbortSignal`, passed to the HTTP client by `@fetch` and as `{ signal }` to a `resource(fetcher)`; a request superseded (E1), cancelled or disposed is aborted on the network, not only ignored. | #256 |
| E3 | **Cancelling is not failing.** `abort()` / `cancel()` returns the source to its last settled state and leaves `error()` as it was. A transport timeout is a failure: the client raises an `HttpTimeoutError`, which becomes `error()`. | #255 |
| E4 | **A failed refresh keeps the data**: `state()` `'error'`, `data()` the last value, `stale()` `true`, `pending()` `false`. `@await` keeps its body. | #141, #145 |
| E5 | **Absence is `undefined`; `null`, `0`, `false` and `''` are data.** Whether there is a result is `state()`, not the value's truthiness: a source that resolved `null` is `'success'`, and `@await` renders its body. A fetcher that resolves `undefined` settles `'success'` with no data, with a warning in development. | #141, #145 |
| E6 | **One layer retries, and only reads.** A read source retries a network failure, a 5xx, a 408 or a 429 (honouring `Retry-After`), with backoff and jitter; its requests go out with the transport's retry off, so attempts do not multiply. Writes are not retried implicitly: the transport retries `GET`, `HEAD` and `OPTIONS` only. | #257 |
| E7 | **Concurrent reads of one key share one request**, aborted only when its last consumer cancels or goes; a value one consumer writes — its answer, its `refetch()`, its `mutate()` — reaches the others on the key. | #258 |
| E8 | **A read dies with its owner.** A read source created in a component's setup or a template scope is disposed with it: its request aborted, its retry chain stopped, its cache subscription released. | #254 |
| E9 | **Every cache is bounded.** The resource cache keeps at most `maxEntries` (LRU, 200) and collects an unsubscribed entry after `gcTime` (5 min); kept-alive route pages and `<component :is @keepAlive>` instances have a maximum and an LRU ([lifecycle.md](lifecycle.md)). | #270 |

Polling and the refetch on focus or reconnect (`useQuery`) never start a request while one is in flight
for the key — they join it (E7) — and pause while their scope is suspended, a frozen route page, and
while the document is hidden (#259).

One shared suite, `packages/core/tests/async-contract.test.ts`, holds the rules against `resource()`,
a compiled `@fetch`, `useQuery` and a loader:
1. key A then key B, A answering after B: `data()` is B's, and the cache holds nothing for A from that
   request;
2. a superseded, cancelled or disposed request has its `AbortSignal` aborted;
3. `abort()` during a first load gives `'idle'` and `error()` `null`, during a refresh `'success'` with
   the data kept; a transport timeout gives `'error'` with an `HttpTimeoutError`;
4. a refresh that fails gives `'error'`, the data kept, `stale()` true, `pending()` false, and `@await`
   keeps the body;
5. a fetcher that resolves `null`, `0` or `false` gives `'success'`, and the body renders that value;
6. a read that fails twice then succeeds with `retry: 2` makes three transport calls; an action whose
   `PUT` fails makes one;
7. two components mounting with the same key make one transport call and both receive the value; the
   request goes on when the first unmounts and is aborted when the second does;
8. a component with `@fetch` destroyed brings its cache subscription count to zero, and the entry is
   collected after `gcTime`.

## Fetching

### @fetch

#### Syntax

The analyzer's form: `@fetch name: 'GET /api/path' as Type;`

```ebnf
FetchDecl    ::= "@fetch" S Word S? ":" S? FetchSpec ( S "as" S Type )? ( S? FetchOptions )? S? ";"?
Word         ::= [A-Za-z0-9_]+
FetchSpec    ::= Quote Method " " Url Quote
Quote        ::= "'" | '"' | "`"
Method       ::= [A-Za-z]+                      /* any case; only GET compiles */
Url          ::= ( UrlChar | "${" Expression "}" )+
UrlChar      ::= /* any character but the Quote that opened the spec */
FetchOptions ::= "{" S? FetchOption ( S? "," S? FetchOption )* ( S? "," )? S? "}"
FetchOption  ::= OptionKey ( S? ":" S? Expression )?
OptionKey    ::= "key" | "staleTime" | "retry" | "tags" | "enabled" | "transform"
               | "onSuccess" | "onError" | "cache" | "stale"
```


#### Semantics

`@fetch` declares a read: the compiler emits `const __httpClient = getDefaultClient();` once and, for
each declaration, `const name = resource(({ signal: __signal }) => __httpClient.get(url, { signal:
__signal, retry: false }), { key: 'GET:/url', …options })`, before the rest of the setup. The signal
is the request's own: it is aborted when a newer request supersedes it, on `abort()` and when the
component goes, so the request stops on the network (#256). `retry: false` turns the client's retry
off for the request: the `retry` option (0 by default) is the only one, and it retries a network
error, a 5xx, 408 or 429, never a 4xx (#257). When the URL holds a `${…}` it is emitted as a template literal in which
signals and props are read (`${page}` → `${__page()}`, `${userId}` → `${userId()}`), whatever quote
the spec was written with, and `key` becomes a function of the same text; `resource()` runs its fetcher
inside an effect, so a change to anything the URL reads fetches again, under the new key. The
resource speaks the async vocabulary every source shares — a resource, `useQuery`, a mutation, a
route loader (#141): `data()` (the last successful value, `undefined` until there is one), `error()`
(the last error, `null` when none; only a new success clears it), `state()` (`idle`, `pending` for a
first load, `success`, `error`), `pending()` (a request in flight: first load, refresh, retry) and
`stale()` (the value is older than `staleTime`, invalidated, or kept after a failed refresh). A
refresh keeps `state()` as it was with `pending()` true; a refresh that fails keeps the data, with
`state()` `error` and `stale()` true (E4). `null`, `0` and `false` are data: `resourceWhen` renders its
success branch with them, and with `undefined` too, with a warning in development (E5).
`refetch()`, `mutate(value)` and `abort()` act on it. `abort()` cancels, which is not failing: the
source goes back to the state its last request settled in, and `error()` is left as it was; a request
that outlives the client's `timeout` fails with an `HttpTimeoutError` in `error()` (#255).
Concurrent reads of one key share one request, aborted only when its last reader goes; a value one
reader writes — its answer, its `refetch()`, its `mutate()` — reaches the others on the key (#258).
Responses are cached by key and stay fresh for `staleTime` (30 000 ms by default). Every `@fetch` is
tagged with its own key — `tags: (k) => [k, …the options' tags]`, `k` being the key the resource
resolved — so `invalidate(['GET:/url'])`, whose array matches tags, reaches it by key (#282). The
options block is evaluated once into a constant spread into the options object, its signals and props
read as in the rest of the script. The type after `as` is read by the editor and
`pdx check --types` (`name.data()` is `Type | undefined`); nothing is generated for it.

#### Rules

- A declaration without a quoted `'METHOD /url'` — no method, no space after it, no quotes — is
  `PDX_FETCH_INVALID`, and nothing is generated.
- A method other than GET, in any case, is `PDX_FETCH_METHOD`: `@fetch` reads. A write is a
  `mutation()`.
- A type written after `:` instead of `as` is `PDX_FETCH_TYPE_COLON`.
- An option `resource()` does not take is `PDX_FETCH_UNKNOWN_OPTION`. A spread in the block names no
  key and is not checked.
- A template that never branches on the resource's error is `PDX_FETCH_NO_ERROR_UI` (info).
- The alpha names `loading()`, `isPending()`, `status()`, `isLoading()`, `hasData()`, `isStale()` and
  the `state()` values `loading`, `reloading`, `stale`, `local` are removed (#141): `PDX_REMOVED_FORM`
  where the file declares the source. `pdx migrate` rewrites `isPending()` to `pending()` and lists
  the others; `loading()` is `state() === 'pending' && !data()`.
- The options are an expression like the rest of the script: a signal or a prop named inside them
  (`enabled: () => ready`) is read (`__ready()`).
- The declaration may go on to the next lines, its options block opened on the first one.
- The spec ends at the next occurrence of its opening quote: a URL that contains that character is
  cut there. Not checked today.
- A name that starts with `_` is not handed to the template.

#### Examples

```pdx
<template>
  @if (users.state() === 'error') {
    <p>Could not load the users.</p>
  }
  @for (users.data() ?? [] as user; track user.id) {
    <p>{{ user.name }}</p>
  }
</template>

<script>
interface User { id: number; name: string }

@fetch users: 'GET /api/users' as User[];
</script>
```

The URL reads a prop and a signal; changing either fetches again.

```pdx
<template>
  @if (orders.state() === 'error') {
    <p>Could not load page {{ page }}.</p>
  }
  <p>{{ orders.data()?.length ?? 0 }} orders</p>
  <button @click="page++">Next page</button>
</template>

<script>
interface Order { id: number; total: number }

@prop customer: number = 1;
let page = $signal(1);
@fetch orders: 'GET /api/customers/${customer}/orders?page=${page}' as Order[] { staleTime: 60000, tags: ['orders'], retry: 2 };
</script>
```

#### Since

alpha

## Writing

### @action

#### Syntax

```ebnf
ActionDecl    ::= "@action" S Identifier S? "(" S? ActionParams? S? ")"
                  ( S "when" S Expression )? ( S "with" S? ActionOptions )? S? "{" Statement* "}"
ActionParams  ::= Identifier ( S? ":" S? Type )? ( S? "," S? "{" S? "signal" S? "}" )?
                | "{" S? "signal" S? "}"
ActionOptions ::= "{" S? ActionOption ( S? "," S? ActionOption )* ( S? "," )? S? "}"
ActionOption  ::= ( "invalidate" | "optimistic" | "onSuccess" | "onError" | "agent" | "consequential" ) S? ":" S? Expression
                | "concurrency" S? ":" S? Quote ( "queue" | "drop" | "coalesce" | "parallel" ) Quote
```

The analyzer's form: `@action save(dto: Dto) when canSave with { invalidate: ['GET:/api/users'] } { await api.save(dto); }`.

#### Semantics

A declared write, the counterpart of `@fetch`. It compiles to a `mutation()` in the setup:
`const save = mutation({ fn: async (dto, { signal }) => { … }, enabled: () => (canSave), ...{ options } })`.
The first parameter is the argument of `save.execute(arg)`; an optional last parameter, written as
the destructuring `{ signal }`, receives the call's `AbortSignal`, aborted by `save.cancel()` — it is
never implicit. `when <expr>` is `save.enabled()`: a call whose turn comes while it is false does not
run, and rejects with `ActionDisabledError`. The body, the `when` expression and the options are
rewritten like the rest of the script, signal reads and writes included. `save` reaches the template
like a `@fetch`: `execute(arg?)`, `pending()`, `enabled()`, `cancel()`, `data()`, `error()`,
`state()`. `<pdx-button :action="save" :action-arg="dto">` runs it on click.

The options are `mutation()`'s: `invalidate` (passed unchanged: an array names cache tags, and a
`@fetch` is tagged with its own key, so `['GET:/api/users']` reaches it), `optimistic`,
`onSuccess`, `onError`, and `concurrency` — what a call made while another is pending does:
`'queue'` (the default) runs it after, `'drop'` ignores it, `'coalesce'` replaces the call waiting
behind the running one, `'parallel'` runs it at once. `agent` (a string, the description an agent is
offered the action under) and `consequential` (`true` for a write an agent should confirm) are
recorded in the `pdx analyze` manifest; registering the tool is the WebMCP adapter's, which is not
built yet.

#### Rules

- The body may span lines; it is read to its balanced `}`. `when` and `with` are keywords only in
  this position, and `when` comes before `with`.
- An option not in the list, or a `concurrency` value that is not one of the four, raises
  `PDX_ACTION_UNKNOWN_OPTION` on the declaration.
- A declaration in no form of `@action` raises `PDX_UNKNOWN_DECLARATION`, and nothing is generated.
- An action with `agent` is offered to agents, and an agent has no capability a person does not: some
  control of the template must run it — a `:action="name"` binding, or a handler that calls
  `name.execute(…)` or `name(…)` — or it raises `PDX_AGENT_ACTION_UNBOUND`. `pdx analyze` records
  each such action with its `agent`, `consequential` and the JSON schema of its input.
- In the editor `save` is core's `Mutation`, typed by the first parameter and by what the body
  returns: `save.execute(1)` on an action that takes a `Dto` is a type error.
- **Concurrency** (#500 in `mutation()`, #501 for the rune), what a call made while another is pending does:

  | `concurrency` | A call while one is pending | For |
  |---|---|---|
  | `'queue'` (default) | runs after it, in call order; a rejection does not stop the next | ordered writes: a list of edits |
  | `'drop'` | is ignored; `execute()` returns the pending call's promise | a submit: a second click must not send twice |
  | `'coalesce'` | replaces any call waiting behind the running one; the running one is not touched | autosave: only the latest draft needs to reach the server |
  | `'parallel'` | runs at once; `data()` and `error()` are those of the last call to settle | independent writes: toggling several rows |

  Aborting the running write is never a policy: a write the server may already have applied is not
  taken back by aborting its request; `cancel()` is the explicit way to stop one, and `{ signal }` is
  how the body honours it. In every mode `pending()` is true while any call runs or waits,
  `optimistic` is applied when a call starts, not when it is queued, and rolled back if that call
  fails, and `invalidate` runs after each success; a coalesced call settles with the call that
  replaced it. Under `'parallel'` a rollback restores only what the failing call changed: each call's
  optimistic value is an overlay. `cancel()` aborts the running call's `signal` and removes every call
  waiting behind it; their promises reject with an `AbortError`, and none becomes `error()` (E3).
- `<pdx-button :action>` follows the policy: under `'drop'` and `'queue'` it is `loading` and refuses
  clicks while the action is pending; under `'coalesce'` and `'parallel'` it stays clickable and shows
  `loading` while any call runs. The cases are `packages/core/tests/mutation-concurrency.test.ts` and
  `packages/ui/tests/unit/button-action.test.ts`.

#### Examples

```pdx
<template>
  <pdx-button :action="save" :action-arg="draft">Save</pdx-button>
  @if (save.pending()) { <pdx-button @click="save.cancel()">Cancel</pdx-button> }
  @if (save.error()) { <p>{{ save.error()?.message }}</p> }
</template>

<script>
interface UserDto { name: string }

let draft = $signal<UserDto>({ name: '' });
const canSave = $derived(draft.name.length > 0);

@action save(dto: UserDto, { signal }) when canSave with { invalidate: ['GET:/api/users'], concurrency: 'drop' } {
  await fetch('/api/users', { method: 'POST', body: JSON.stringify(dto), signal });
}
</script>
```

#### Since

beta (#501)

## Forms

### @form

#### Syntax

The analyzer's form: `@form name: { field: string { required } };`

```ebnf
FormDecl      ::= "@form" S Word S? ":" S? ( InlineSchema | SchemaName ) ( S? FormOptions )? S? ";"?
                | "@form" S Word S? ":" S? SchemaName S "from" S "parent" S? ";"?
SchemaName    ::= Word
InlineSchema  ::= "{" S? Field ( S? "," S? Field )* ( S? "," )? S? "}"
Field         ::= ScalarField | ObjectField | RowsField
ScalarField   ::= Word S? "?"? S? ":" S? FieldType ( S? Rules )?
ObjectField   ::= Word S? "?"? S? ":" S? "{" S? ScalarField ( S? "," S? ScalarField )* S? "}"
RowsField     ::= Word S? "?"? S? ":" S? "[" S? "{" S? ScalarField ( S? "," S? ScalarField )* S? "}" S? "]"
FieldType     ::= [A-Za-z0-9_|'"]+ "[]"?
Rules         ::= "{" S? Rule ( S? "," S? Rule )* S? "}"
Rule          ::= "required" | Word ( S? ":" S? RuleArgument )?
RuleArgument  ::= [^,}]+
FormOptions   ::= "{" S? FormOption ( S? ( ";" | "\n" ) S? FormOption )* S? ";"? S? "}"
FormOption    ::= ( "save" | "saveMode" ) S? ":" S? StringLiteral
                | "warnUnsaved" ( S? ":" S? ( "true" | "false" ) )?
                | ( "validate" | "source" | "parent" ) S? ":" S? Expression
                | "fields" S? ":" S? "{" ( Word S? ":" S? "{" FieldSave ( "," FieldSave )* "}" ","? )* "}"
FieldSave     ::= S? ( ( "save" | "saveMode" ) S? ":" S? StringLiteral | "saveDebounce" S? ":" S? [0-9]+ ) S?
```

`Word` is defined under `@fetch`. The inline schema and the options block may span lines; a `fields`
option is written on one line.

#### Semantics

An inline schema compiles to `const name = createForm({ initialValues: { … }, validators: { … }, …options })`,
before the rest of the setup. Each field starts empty by its type: `number` → `0`, `boolean` →
`false`, `T[]` → `[]`, any other type → `''`; a rows field (`[{ … }]`) → `[]`, and an object field is
emitted nested (`address: { city: '' }`), which `createForm` flattens into dotted paths. A field's
validators are `required()` when its rules say `required`, then each other rule as a call: `min: 18` →
`min(18)`, `email` → `email()`. A rule is one of `@pdxui/core`'s validators, imported from there, or a
function of the script's own that returns a validator, called the same way. An object's sub-fields
are validated under their dotted path (`'address.city'`). An external schema compiles to
`createForm({ initialValues: {}, schema: Name, …options })`, where `Name` is a Standard Schema v1 value
(Zod, Valibot, ArkType). The options map to `createForm`'s: `save` → `saveMode`, `fields` →
`fieldConfig`, `validate` (a function that reads every value and returns messages by field),
`warnUnsaved`, `source`, `parent` — and `source` or `parent` adds `name: 'formName'`. The result is a
`Form`: each field is a member, `name.x` — a nested one by its dotted path, `name['address.city']` —
with `value()`, `error()`, `touched()`, `dirty()`, `required`, `onChange(v)`, `onBlur()` (#128); beside
them the form's own members, `valid()`, `errors()`, `dirty()`, `getValues()`, `handleSubmit(fn)`,
`reset()`, `array(name)`. A field whose name is known only at run time is `formField(form, name)`,
undefined for a name that is no field. A control binds a field through its model,
`::value="name.email"` ([template.md](template.md), «`::name` two-way binding»), and
`<pdx-form-field :field="name.email">` shows its error, warning and required marker.

`@form name: SchemaName from parent;` makes the component a **section** of the form above it (#613):
it creates no form, and `name` is the form of the `<pdx-form>` it is projected into —
`const name = inheritedForm(ctx.el)`. The section binds that form's fields as any control does,
`::value="name.email"` and `<pdx-form-field :field="name.email">`. The form is not there when the
section sets up (a child connects before its parent, and a projected child mounts detached), so each
`name.x` is a stand-in made once that reads the inherited form when asked: before the form is found it
reads nothing and writes nowhere, and from the moment `<pdx-form>` provides it, every reading — the
binding made at mount included — is the field's. Called, `name.reset()` or `name.valid()`, it calls
the form's member. `SchemaName` names the form's values, for the reader and the editor; nothing is
generated from it. This is not the `parent` option, which makes a NEW form a child of another.

`handleSubmit(fn)` returns a handler that returns the submit's promise; a second submit while one
runs sends nothing and returns the running one's. An autosave (`saveMode` other than `onSubmit`)
whose `onFieldSave` callback returns its save's promise keeps one save per field in flight and at
most one waiting, which starts with the field's newest value when the one in flight settles —
rules F2 and F7 below (#279). A submit rejected with RFC 9457 field errors (an
`errors` map of path → messages, in an `HttpError`'s body or thrown as it is) puts each message on
the field the path names — as written, else ignoring case — and the rest in `formError()`; a field's
clears on its next edit, and all of them when a submit starts — rule F5 (#280).

#### Rules

- A declaration without the colon after the name (`@form user { … }`), or whose schema is not one
  word (`Schemas.User`), is `PDX_UNKNOWN_DECLARATION`, and nothing is generated.
- A field that produces nothing — fields separated by `;`, rules not in braces, an object nested in
  an object — is `PDX_FORM_FIELD_UNPARSED`.
- A field named like a member of the form — `valid`, `dirty`, `touched`, `submitting`, `submitted`,
  `errors`, `warnings`, `saveMode`, `validateOn`, `state`, `submitError`, `formError`, `handleSubmit`,
  `reset`, `setValues`, `validate`, `array`, `getValues`, `onFieldSave`, `dispose` — is
  `PDX_FORM_FIELD_RESERVED` (error): it would hide the member. An object's leaves are not checked
  (`state: { code }` makes `state.code`). A form whose schema the compiler does not read is refused by
  `createForm` when it runs, with the same code in the message.
- `name.fields` is gone: `name.fields.x` is `PDX_REMOVED_FORM`, and `pdx migrate` rewrites it to
  `name.x` (`form-fields-member`).
- Inside `<pdx-form :form="name">`, a library control with only a `name`, or a `<pdx-form-field name="x">`,
  is `PDX_REMOVED_FORM` (#128): nothing wires it by its name. `pdx migrate` (`form-name-binding`)
  writes `::<model>="name.x"` from the control's manifest — a control with no manifest entry, or with
  more than one model (`pdx-checkbox`), is flagged — and `:field="name.x"` on the form field; inside a
  `<pdx-field-group>` the path is the full one, and so is the control's `name`.
- In a form **section** — a component that declares `@form name: Schema from parent;`, or whose
  script calls `useForm()` / `tryUseForm()` — the same is `PDX_REMOVED_FORM` (#613): its whole
  template counts as inside the inherited form, and nothing wires a control by its name. `pdx migrate`
  rewrites it to the declared form, `::<model>="name.x"` and `:field="name.x"`; a section that only
  calls `useForm()` / `tryUseForm()` names no values type, and is flagged: declare
  `@form name: Values from parent;` and bind to it.
- `required` on a control bound to a form field (`::value="name.x" required`, or `:required`) is
  `PDX_FORM_REQUIRED_IN_MARKUP` (warning): the field marks its control required from its rules, and
  the markup is a second place to say it that validation does not read. `pdx migrate` flags it
  (`form-required-in-markup`).
- A value still waiting in a `::x.debounce(ms)` binding to a field is written to it before
  `handleSubmit` validates and before `validate()` (rule F6), whether or not a `submit` event started them.
- **Asynchronous validation and submit**, rules with no syntax of their own:

  | # | Rule | |
  |---|---|---|
  | F1 | An async validator's answer is written only if the field still holds the value it was asked about. | alpha |
  | F2 | A second submit while one is validating or submitting is dropped — `concurrency: 'drop'`, applied by the form's `handleSubmit(fn)` — and resolves when the running one does. | #279 |
  | F3 | Submit flushes first: a debounced async validation still waiting runs now, and submit waits for every async validation of the current values before deciding. | alpha |
  | F4 | A value that changes while submit is validating stops that submit: it returns invalid, and the user submits again. Submit never sends a value it did not validate. | #253 |
  | F5 | When the submit handler rejects with RFC 9457 field errors, each message lands on its field's `error()`, a path with no field on `formError()`; a field's server error clears on its next edit. | #280 |
  | F6 | A pending value from a `::x.debounce(ms)` binding is written to its field before submit validates or reads the values. | #128 |
  | F7 | The form's autosave (`saveMode`, `saveDebounce`) is a write with the `'coalesce'` policy: a save waiting behind a running one is replaced by the newest values. | #279 |
- A rule on a field of a rows field is parsed and dropped: `PDX_FORM_ARRAY_RULES_IGNORED`. A row's
  rules are registered by `<pdx-field-list :item-fields>`.
- A form that no `handleSubmit(` and no `<pdx-form :form="name">` submits is `PDX_FORM_NO_SUBMIT`
  (info). An inherited form (`from parent`) is not: the page that owns it submits it.
- `?` makes a field not required even when its rules say `required`; on an object or a rows field it
  changes nothing.
- A rule is one of core's validators — `required`, `minLength`, `maxLength`, `email`, `pattern`, `url`,
  `min`, `max`, `integer` — or a name the script declares or imports. Anything else is
  `PDX_FORM_UNKNOWN_RULE`. A script function of the same name as a core rule replaces it.
- A rule argument cannot contain `,` or `}`. Not checked today.
- Options are separated by `;` or a line break, not by commas; an option the list above does not name
  is ignored. Not checked today.
- The form is created before the script's own statements, unless its schema, its `validate`, `source`
  or `parent`, or a rule of the script's own reads a `const`, `let` or `var` the script declares: then
  it is created right after the statement that declares it, wherever the `@form` was written.
- A name that starts with `_` is not handed to the template.

#### Examples

```pdx
<template>
  <form @submit="submit">
    <input :value="signup.name.value()" @input="setName" @blur="signup.name.onBlur()" />
    @if (signup.errors().name) {
      <p>{{ signup.errors().name }}</p>
    }
    <button type="submit" :disabled="!signup.valid()">Sign up</button>
  </form>
</template>

<script>
@form signup: {
  name: string { required, minLength: 3 },
  email: string { required, email },
  age?: number { min: 18 },
  address: { street: string, city: string },
  lines: [{ product: string, qty: number }]
} {
  validate: checkAge
  warnUnsaved
};

function checkAge(values: { age: number }) {
  return values.age > 120 ? { age: 'Check the age' } : {};
}

function setName(e: Event) {
  signup.name.onChange((e.target as HTMLInputElement).value);
}

const submit = signup.handleSubmit(async (values) => {
  console.log(values);
});
</script>
```

An external schema, with its options in the one pair of braces it has:

```pdx
<template>
  <form @submit="submit">
    <button type="submit" :disabled="!contact.valid()">Send</button>
  </form>
</template>

<script>
import { ContactSchema } from './contact-schema';

@form contact: ContactSchema { save: 'onBlur'; warnUnsaved };

const submit = contact.handleSubmit((values) => console.log(values));
</script>
```

#### Since

alpha

## Stores

### @store

#### Syntax

The analyzer's form: `@store name;` — or, persisted, `@store name { persist: 'local' };`.

```ebnf
StoreDecl ::= "@store" S Word ( S? "{" S? "persist" S? ":" S? ( "'" Word "'" | '"' Word '"' ) S? "}" )? S? ";"?
```

`Word` is defined under `@fetch`. The declaration is one line, and a file has one.

#### Semantics

The file **is** the store: a `.pdx` or a `.pdx.ts` whose script declares `@store name` compiles to a
module, not a component. Its script becomes the factory of
`const __store_name = createGlobalStore('name', () => { …; return { …every name it declares… }; }, { persist })`,
with the same rewrites a `<script>` gets, and the module exports one hook,
`export function useName() { return __store_name; }` (the name capitalised after `use`). The factory
runs once per name for the whole app; every caller of the hook gets the same object, in which a
`$signal` is the signal itself (`cart.count()` to read, `cart.count.set(…)` to write), a `$store` is
its proxy, and a function is the function. A call to `useName()` in another `.pdx` imports the hook by
itself when the store file sits under `src/` or `pages/` of the Vite root. `persist: 'local'` keeps
the store in `localStorage`, any other value in `sessionStorage`, under `__pdx_store_name`: the
store's top-level `$signal`s are restored when it is created and written 100 ms after they change. A
`$store` object and a `$derived` are not persisted.

#### Rules

- Any other form — `@store name = { … }`, an option other than `persist` — is
  `PDX_UNKNOWN_DECLARATION`, and nothing is generated.
- An `export` that reads a name the store declares is `PDX_STORE_EXPORT`: exports are moved to module
  level, outside the factory. An export that reads none of them is moved as it is.
- A `persist` value other than `'local'` or `'session'` is `PDX_UNKNOWN_DECLARATION` (error), and
  the store is not persisted; it used to be kept in `sessionStorage` whatever was written (#278).
- A `<template>` in a store file is ignored, and none of the template checks run. Not checked today.
- Two files that declare the same store name share one instance. Not checked today.

#### Examples

A store file, `cart.pdx`:

```pdx
<script>
@store cart { persist: 'local' };

interface Product { id: number; price: number }

let count = $signal(0);
let items = $store({ products: [] as Product[], total: 0 });
const empty = $derived(count === 0);

function add(p: Product) {
  items.products.push(p);
  items.total += p.price;
  count++;
}
</script>
```

A component that uses it:

```pdx
<template>
  <p>{{ cart.count() }} items, {{ cart.items.total }}</p>
  <button @click="cart.add({ id: 1, price: 10 })">Add</button>
</template>

<script>
import { useCart } from './cart.pdx';

const cart = useCart();
</script>
```

#### Since

alpha

### $store

#### Syntax

The analyzer's form: `let state = $store({ items: [] });`

```ebnf
StoreRune     ::= ( "let" | "const" | "var" ) S StoreDeclarator ( S? "," S? Declarator )* S? ";"?
StoreDeclarator ::= Word ( S? ":" S? Type )? S? "=" S? "$store" ( S? "<" Type ">" )? S? "(" Expression ")"
Declarator    ::= /* a TypeScript variable declarator: another rune or a plain one */
```

#### Semantics

`$store(initial)` compiles to `const name = store(initial)`: a Proxy over the object, so a read of a
property is tracked by the effect, the binding or the `computed` that makes it, and a write notifies
what read that property. Nested plain objects and arrays are proxied when they are read; the mutating
methods of an array (`push`, `splice`, `sort`, …), of a `Map` and of a `Set` notify; a `Date`, a
`RegExp` and other native objects are returned as they are. The name is not rewritten: it is read as
`state.count`, not `state()`, and written as `state.count++` or `state.items.push(x)`, in the script
and in the template alike. A prop in the initial value is read once, with `.peek()`: the store does
not follow the prop afterwards.

#### Rules

- `$store` is read only as the initialiser of a `let`, `const` or `var` declarator at the top of the
  script. Anywhere else (`wrap($store({}))`, a function body) it is `PDX_RUNE_POSITION` (error) at the
  call, naming `store()` from `@pdxui/core` (#278).
- The variable keeps the keyword that declared it. Assigning a `let` store again (`state = { … }`)
  changes the script's variable only: the template keeps the store it was handed when the component
  was set up. Write its properties to update the page. Not checked today.
- A name declared twice at the top of the script is `PDX_DUP_DECLARATION`.
- A name that starts with `_` is not handed to the template.

#### Examples

```pdx
<template>
  <p>{{ state.count }}: {{ state.items.join(', ') }}</p>
  <button @click="add">Add</button>
</template>

<script>
@prop start: number = 0;
let state = $store({ count: start, items: [] as string[] });

function add() {
  state.count++;
  state.items.push(`item ${state.count}`);
}
</script>
```

#### Since

alpha
