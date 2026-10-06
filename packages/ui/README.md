# @pdxui/ui

The component library of PDX UI: 100+ Web Components for line-of-business applications.
Among them are the data grid, forms and fields, date and time pickers, dialogs, drawers and toasts,
menus, tabs, trees, charts and a rich-text editor. Every component is a standard custom element
(`<pdx-*>`). Most of them carry a certification manifest, which measures them in 13 themes for
geometry, accessibility (axe), keyboard behaviour and isolation from hostile CSS.

```bash
pnpm add @pdxui/ui @pdxui/core @pdxui/design
```

In a `.pdx` application you import nothing: the compiler imports each component you use in a
template. Anywhere else, import the component, or `@pdxui/ui` for all of them:

```ts
import '@pdxui/design';
import '@pdxui/ui/data-grid';
```

```html
<pdx-data-grid label="Orders"></pdx-data-grid>
```

Components created only from script are imported by hand, for example
`import { toast } from '@pdxui/ui/toast'`.

## Documentation

- [Components](https://pdxui.com/docs/components) and the live gallery on [pdxui.com](https://pdxui.com)
- [Accessibility](https://pdxui.com/docs/accessibility), [overlays](https://pdxui.com/docs/overlays), [imperative methods](https://pdxui.com/docs/imperative-methods)
- `custom-elements.json` (the `@pdxui/ui/manifest` export) describes every component's props,
  events, slots and roles, for editors and agents.

## License

[MIT](LICENSE). See [docs/LICENSING.md](../../docs/LICENSING.md).
