**The markup** is three attributes on plain elements — the accordion wires the rest:

```html
<pdx-accordion mode="single">
  <div data-accordion-item data-open>
    <button data-accordion-trigger>Question</button>
    <div data-accordion-content>Answer</div>
  </div>
  <div data-accordion-item="y2023">…</div>
</pdx-accordion>
```

`[data-accordion-item]` is one section, `[data-accordion-trigger]` its header, `[data-accordion-content]`
its body. `data-open` on an item opens it initially; `data-disabled` locks one item. The value of
`data-accordion-item` is the id `el.expand(id)` / `collapse(id)` / `toggle(id)` accept (an index works too).

**Do not write the ARIA.** The accordion gives every trigger `id`, `aria-controls`, `aria-expanded` and
`role="button"`, every content `role="region"` and `aria-labelledby`, and hides closed content. Generated
ids are unique per accordion, so two on a page never collide; ids you write are kept. **Items added later**
(appended on scroll, loaded by a fetch) are wired the same way, and join the arrow-key navigation.
