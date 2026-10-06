### `<pdx-accordion>`

Expandable, collapsible sections.

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

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `mode` | `mode` | string | `'single'` | "single" = one open at a time (default), "multiple" = any number open |
| `disabled` | `disabled` | boolean | `false` | Disable all items |
| `loading` | `loading` | boolean | `false` | Show loading state |

**API (via `:ref`)**

| Call | Notes |
|---|---|
| `expand(id)` | Open the item, by id or index. No-op if it is already open, disabled, or not found. |
| `collapse(id)` | Close the item, by id or index. No-op if it is already closed, disabled, or not found. |
| `toggle(id)` | Open the item if closed, close it if open. No-op if disabled or not found. |
| `expandAll()` | Open every item — but under `mode="single"` each one closes the previous, so only the last stays open. |
| `collapseAll()` | Close every item. |

**Events:** `pdx-change` → `detail: { open }` — Fired when the value changes.

**Renders:** roles `button` · `region`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Single Mode (FAQ)** — Only one section open at a time. Opening a new one closes the previous. _(from the live demo)_

```html
<pdx-accordion>
  <div data-accordion-item data-open>
    <button data-accordion-trigger>What is Pragmatic Design?</button>
    <div data-accordion-content>
      <p class="answer">A full-stack framework ecosystem combining .NET backend source generators with a reactive frontend UI system. CSS-first design tokens, 13 themes, and agent-native DX.</p>
    </div>
  </div>
  <div data-accordion-item>
    <button data-accordion-trigger>How does the compiler work?</button>
    <div data-accordion-content>
      <p class="answer">The PDX compiler transforms .pdx Single File Components into optimized JavaScript modules. It handles signal rewriting, template compilation, CSS scoping, auto-imports, and route generation.</p>
    </div>
  </div>
  <div data-accordion-item>
    <button data-accordion-trigger>Can I use it without the backend?</button>
    <div data-accordion-content>
      <p class="answer">Absolutely. The UI framework works standalone with any backend. The .NET integration is optional and additive.</p>
    </div>
  </div>
  <div data-accordion-item>
    <button data-accordion-trigger>What browsers are supported?</button>
    <div data-accordion-content>
      <p class="answer">All modern evergreen browsers: Chrome, Firefox, Safari, Edge. Uses standard Web Components, CSS custom properties, and ES2022+.</p>
    </div>
  </div>
</pdx-accordion>
```

**Multiple Mode** — Any number of sections can be open simultaneously. _(from the live demo)_

```html
<pdx-accordion mode="multiple">
  <div data-accordion-item data-open>
    <button data-accordion-trigger>
      <pdx-icon name="user" size="sm"></pdx-icon>
      <span>Profile Settings</span>
    </button>
    <div data-accordion-content>
      <div class="setting-group">
        <pdx-form-field label="Display Name" size="sm">
          <pdx-input placeholder="Your name" value="Alessandro"></pdx-input>
        </pdx-form-field>
        <pdx-form-field label="Email" size="sm">
          <pdx-input type="email" value="alex@pragmatic.dev"></pdx-input>
        </pdx-form-field>
      </div>
    </div>
  </div>
  <div data-accordion-item>
    <button data-accordion-trigger>
      <pdx-icon name="bell" size="sm"></pdx-icon>
      <span>Notifications</span>
    </button>
    <div data-accordion-content>
      <div class="setting-group">
        <pdx-switch label="Email notifications"></pdx-switch>
        <pdx-switch label="Push notifications" checked></pdx-switch>
        <pdx-switch label="Weekly digest"></pdx-switch>
      </div>
    </div>
  </div>
  <div data-accordion-item>
    <button data-accordion-trigger>
      <pdx-icon name="shield" size="sm"></pdx-icon>
      <span>Security</span>
    </button>
    <div data-accordion-content>
      <div class="setting-group">
        <pdx-switch label="Two-factor authentication" checked></pdx-switch>
        <pdx-form-field label="Session timeout (minutes)" size="sm">
          <pdx-slider value="30" min="5" max="120" step="5" showLabel></pdx-slider>
        </pdx-form-field>
      </div>
    </div>
  </div>
  <div data-accordion-item data-disabled>
    <button data-accordion-trigger>
      <pdx-icon name="lock" size="sm"></pdx-icon>
      <span>Admin (requires permissions)</span>
    </button>
    <div data-accordion-content>
      <p class="answer">You need admin privileges to access this section.</p>
    </div>
  </div>
</pdx-accordion>
```

**Single Item (Collapsible)** — An accordion with one item works as a standalone collapsible. Same API, same animation. _(from the live demo)_

```html
<pdx-accordion>
  <div data-accordion-item>
    <button data-accordion-trigger>Show advanced options</button>
    <div data-accordion-content>
      <div class="setting-group">
        <pdx-switch label="Debug mode"></pdx-switch>
        <pdx-switch label="Verbose logging"></pdx-switch>
        <pdx-form-field label="Custom endpoint" size="sm">
          <pdx-input placeholder="https://api.example.com"></pdx-input>
        </pdx-form-field>
      </div>
    </div>
  </div>
</pdx-accordion>
```

