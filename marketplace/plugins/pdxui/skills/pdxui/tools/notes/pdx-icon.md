**A `name` that is not in the set renders nothing** (in development it says so in the console). The
built-in set is `pragmatic`, and `pdx-icon` registers it itself, so it is the default:
`<pdx-icon name="search">` works with no setup. Its names are listed below, generated from
`packages/ui/src/icon/pragmatic-icon-data.ts`.

**A page ships the icons it draws, not the set.** Each icon is its own module,
`@pdxui/ui/icons/<name>`, whose default export is the SVG. The compiler imports the ones it can see:
a literal `<pdx-icon name="check">`, a literal value of an icon prop (`<pdx-fab icon="edit">`,
`<pdx-empty-state icon="inbox">`), and a literal value of an `icon` property in the `.pdx` script
(`actions([{ icon: 'eye', … }])`, menu items). Any other name — computed, or written in a `.ts` module
— loads on demand the first time it is drawn and appears a round trip later. To have one on the first
screen, import it yourself:

```ts
import { defineIcons } from '@pdxui/ui/icon/pdx-icon';
import trash from '@pdxui/ui/icons/trash';
defineIcons({ trash });
```

`registerPragmaticIcons()` from `@pdxui/ui/icon/pragmatic-icons` puts the whole set on the page up
front; `import '@pdxui/ui'` (every component, for a page with no compiler) does it for you.

`set="lucide"` is **not** a library that ships with it: `@pdxui/ui/icon/lucide-icons` exports
`registerLucideIcons(icons)`, and `icons` is a `{ name: svgString }` map the app provides, for example
a subset extracted from `lucide-static`. Until the app calls it, every `set="lucide"` icon is empty.
Any other set: `registerIconSet(name, resolver)` from `@pdxui/core`, then `set="<name>"`.
