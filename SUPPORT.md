# Support

## Where to go

| You have | Go to |
|---|---|
| A question — how to do something, why something behaves as it does | [Discussions → Q&A](https://github.com/pragmatic-design/pdxui/discussions/categories/q-a) |
| An idea, or a feature you would like | [Discussions → Ideas](https://github.com/pragmatic-design/pdxui/discussions/categories/ideas) |
| Something that does not work as documented | [An issue](https://github.com/pragmatic-design/pdxui/issues/new/choose), with the bug template |
| A security vulnerability | Never a public issue: see [SECURITY.md](SECURITY.md) |

## Before you ask

- The [documentation](https://pdxui.com/docs) covers the template syntax, the runtime and every
  component, and the [diagnostics reference](https://pdxui.com/docs/diagnostics) explains every
  `PDX_` code the compiler reports.
- `pdx check` prints each problem with its code, and a hint where there is one; `pdx check --fix`
  applies the fixes the findings carry.
- The compiled output is ordinary JavaScript: reading what the compiler made of a `.pdx` file usually
  shows why it behaves as it does.

## What to include

The `@pdxui` package versions, the browser, `node --version`, whether it happens in `pdx dev`, in a
production build or both, the smallest `.pdx` file that shows the behaviour, and what you expected
instead. A diagnostic's full text, with its `PDX_` code, saves a round trip.

## What to expect

During the alpha PDX UI has a single maintainer. Questions are answered on a best-effort basis, and
security reports follow [SECURITY.md](SECURITY.md).
