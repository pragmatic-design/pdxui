// The function a component draws an entry with: a parent's snippet, as `declaredSnippet` gives it, called
// with a scope object. The alpha's scoped slots — `slotCarrier`, `renderSlot`, `ctx.__slots` — are
// removed (#492): a component reads its snippets with `declaredSnippet`, and a `.pdx` renders one with
// `@render`.

export type SlotFunction = (scope: Record<string, unknown>) => Node | DocumentFragment;
