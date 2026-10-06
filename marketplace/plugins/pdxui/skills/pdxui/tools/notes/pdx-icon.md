**A `name` that is not in the set renders nothing, silently.** The built-in set is `pragmatic`, and
`pdx-icon` registers it itself, so it is the default: `<pdx-icon name="search">` works with no
setup. Its names are listed below, generated from `packages/ui/src/icon/pragmatic-icons.ts`.

`set="lucide"` is **not** a library that ships with it: `@pdxui/ui/icon/lucide-icons` exports
`registerLucideIcons(icons)`, and `icons` is a `{ name: svgString }` map the app provides, for example
a subset extracted from `lucide-static`. Until the app calls it, every `set="lucide"` icon is empty.
Any other set: `registerIconSet(name, resolver)` from `@pdxui/core`, then `set="<name>"`.
