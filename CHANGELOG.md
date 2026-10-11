# Changelog

Changes that an app built on PDX UI can notice. Newest first.

This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html) and
[Conventional Commits](https://www.conventionalcommits.org/). Pre-release versions (`-alpha.N`)
may introduce breaking changes between versions; stable releases (`1.0.0` and later) follow strict
semver.

## Unreleased

### Features

- Initial public release.
- `@params` and `@search` report a field they cannot read with `PDX_ROUTE_FIELD_INVALID`, an error,
  instead of dropping it; a quoted type (`id: 'number'`) carries the fix to `id: number`. Both
  blocks may span several lines. (#105)
- `<pdx-button :action="save" :action-arg="dto">` runs a write: a click calls `save.execute(dto)`,
  and while `save.pending()` the button is busy and refuses clicks, so a double click sends one
  write. A refusal stays on `save.error()` and is announced as `pdx-action-error`. Any object with
  `execute` and `pending` qualifies, a `mutation()` among them. (#49)

### Changed

- Context requests follow the Web Components context protocol: the `context-request` event carries
  the key itself, compared by identity, with `callback` and `subscribe`. A provider or consumer
  from another library (Lit's `@lit/context`, for one) and PDX now find each other; a request
  built with the old private `{ name: key }` shape is no longer answered. `provide` honours
  `subscribe: true` for a provided signal. (#103)
- Without a DOM, `html``` throws an error that names the call instead of returning an empty
  fragment. (#93)

### Fixes

- Scoped `<style scoped>` rules inside `@container` and `@starting-style` now apply only to the
  component. Before, they were emitted unscoped and applied to every matching element on the page.
  (#104 — entry by @jay23606, from #166)
- A production build keeps `@transition`, `@stagger`, `@mode` and `@move` on `@if` and `@for`: the
  inline render path dropped them, so an animation played in dev and not in the shipped app. (#85)
- `@pdxui/core`, a compiled component and a `@pdxui/ui` component can be imported in Node:
  `component()` registers nothing where there is no custom element registry. (#93)
- A `@fetch` URL that interpolates a signal or a prop refetches when it changes. It used to name a
  variable that does not exist. (#101)
- A subscriber or an error handler that throws during a write no longer stops every later effect in
  the page. (#102)
- A top-level `const` or `let` with a type annotation (`const SORT: Sort[] = […]`) reaches the
  template. It was left out of the setup's return: `undefined` in dev, and in a production build
  the component threw at mount and rendered nothing. (#44)
- In a production build, `::value` on a component (`<pdx-select ::value="country">`) and on a
  `<select>` updates the signal again: the build listened to `input` on everything, and a
  component's `pdx-change` or a select's `change` never reached it. Both builds now share core's
  `bindTwoWay`, newly exported, which also sanitises a URL name such as `::formaction`. (#97)
- A production build loads a component used only inside `@defer`: the trigger used to fire and
  leave an unknown, empty element. (#98)
- In a production build, a binding writes a property only when its value changes. It wrote again
  whenever the row it read from was replaced, so a field being typed in took back the saved value
  when another field's save landed. (#44)
- Pasting HTML into `pdx-rich-text` no longer leaves a stray space node between two blocks: the
  whitespace a source puts between `<p>`s is layout, and is dropped. A space between inline nodes is
  kept. (#74)
