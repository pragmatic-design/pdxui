# Data declarations

The declarations that bring data into a component or share it between components: `@fetch` reads
from a server, `@form` holds what a user enters, `@store` makes a file a store shared by the whole
app, and `$store` is a deep reactive object. Each one is a statement of a `<script setup>`
([script.md](script.md)) that the analyzer reads line by line, starting at the beginning of the line.

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
resource's `data()`, `error()`, `state()` (`idle`, `loading`, `reloading`, `success`, `stale`, `error`,
`local`), `loading()` and `status()` are signals; `refetch()`, `mutate(value)` and `abort()` act on it.
`abort()` cancels, which is not failing: the source goes back to `idle`, or to `success` when it has
data, and `error()` is left as it was; a request that outlives the client's `timeout` fails with an
`HttpTimeoutError` in `error()` (#255).
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

<script setup>
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

<script setup>
interface Order { id: number; total: number }

@prop customer: number = 1;
let page = $signal(1);
@fetch orders: 'GET /api/customers/${customer}/orders?page=${page}' as Order[] { staleTime: 60000, tags: ['orders'], retry: 2 };
</script>
```

#### Since

alpha

## Forms

### @form

#### Syntax

The analyzer's form: `@form name: { field: string { required } };`

```ebnf
FormDecl      ::= "@form" S Word S? ":" S? ( InlineSchema | SchemaName ) ( S? FormOptions )? S? ";"?
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
`Form`: `fields.x` (`value()`, `error()`, `touched()`, `onChange(v)`, `onBlur()`), `valid()`,
`errors()`, `dirty()`, `getValues()`, `handleSubmit(fn)`, `reset()`, `array(name)`.

`handleSubmit(fn)` returns a handler that returns the submit's promise; a second submit while one
runs sends nothing and returns the running one's. An autosave (`saveMode` other than `onSubmit`)
whose `onFieldSave` callback returns its save's promise keeps one save per field in flight and at
most one waiting, which starts with the field's newest value when the one in flight settles —
rules F2 and F7 of the beta reference (#279).

#### Rules

- A declaration without the colon after the name (`@form user { … }`), or whose schema is not one
  word (`Schemas.User`), is `PDX_UNKNOWN_DECLARATION`, and nothing is generated.
- A field that produces nothing — fields separated by `;`, rules not in braces, an object nested in
  an object — is `PDX_FORM_FIELD_UNPARSED`.
- A rule on a field of a rows field is parsed and dropped: `PDX_FORM_ARRAY_RULES_IGNORED`. A row's
  rules are registered by `<pdx-field-list :item-fields>`.
- A form that no `handleSubmit(` and no `<pdx-form :form="name">` submits is `PDX_FORM_NO_SUBMIT`
  (info).
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
    <input :value="signup.fields.name.value()" @input="setName" @blur="signup.fields.name.onBlur()" />
    @if (signup.errors().name) {
      <p>{{ signup.errors().name }}</p>
    }
    <button type="submit" :disabled="!signup.valid()">Sign up</button>
  </form>
</template>

<script setup>
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
  signup.fields.name.onChange((e.target as HTMLInputElement).value);
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

<script setup>
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
with the same rewrites a `<script setup>` gets, and the module exports one hook,
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
- A `persist` value other than `'local'` or `'session'` persists to `sessionStorage`. Not checked
  today.
- A `<template>` in a store file is ignored, and none of the template checks run. Not checked today.
- Two files that declare the same store name share one instance. Not checked today.

#### Examples

A store file, `cart.pdx`:

```pdx
<script setup>
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

<script setup>
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
  script. Anywhere else (`wrap($store({}))`) it is left as written, and `$store` does not exist at run
  time. Not checked today.
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

<script setup>
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
