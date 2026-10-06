### `<pdx-avatar>`

User image or initials, any size.

| Prop | Attr | Type | Default | Notes |
|---|---|---|---|---|
| `src` | `src` | string | `''` | Image URL; falls back to initials if it fails. |
| `alt` | `alt` | string | `''` | The person's name: initials, accessible name and auto color. Without it the avatar is decorative (aria-hidden). |
| `size` | `size` | string | `'md'` | Size of the control (e.g. sm, md, lg). |
| `shape` | `shape` | string | `'circle'` | Shape: 'circle' or 'square'. |
| `color` | `color` | string | `'auto'` | 'auto' generates color from name. Or pass a CSS color. Default: 'auto'. |

**Renders:** roles `img`


#### Examples

_From the component's demo, one per section. They illustrate the markup and the calls: `...` marks
code left out, and a script is the part that matters, not a whole file. The props and events they use
are checked against the manifest above._

**Initials Fallback** — When no `src`, extracts initials from `alt`. Full name = first + last, single name = first 2 chars.

```html
<pdx-avatar alt="Jane Doe"></pdx-avatar>
<pdx-avatar alt="Bob"></pdx-avatar>
```

**Auto Color from Name** — `color="auto"` (default) generates a consistent color from the name hash. Same name = always same color. 10 distinct hues.

```html
<pdx-avatar alt="Alice"></pdx-avatar>  <!-- auto color from "Alice" -->
<pdx-avatar alt="Bob" color="#e91e63"></pdx-avatar>  <!-- explicit color -->
```

**With Image** — `src` for image. Falls back to initials on error.

```html
<pdx-avatar src="/avatars/person-1.svg" alt="Jane Doe"></pdx-avatar>
<pdx-avatar src="/missing-avatar.jpg" alt="Error Fallback"></pdx-avatar>  <!-- shows "EF" -->
```

**Sizes** — 5 sizes: xs (24px), sm (32px), md (40px), lg (48px), xl (64px). _(from the live demo)_

```html
<div class="demo-row">
  <pdx-avatar size="xs" alt="XS User"></pdx-avatar>
  <pdx-avatar size="sm" alt="SM User"></pdx-avatar>
  <pdx-avatar size="md" alt="MD User"></pdx-avatar>
  <pdx-avatar size="lg" alt="LG User"></pdx-avatar>
  <pdx-avatar size="xl" alt="XL User"></pdx-avatar>
</div>
<div class="demo-row">
  <pdx-avatar size="xs" src="/avatars/person-4.svg" alt="XS"></pdx-avatar>
  <pdx-avatar size="sm" src="/avatars/person-4.svg" alt="SM"></pdx-avatar>
  <pdx-avatar size="md" src="/avatars/person-4.svg" alt="MD"></pdx-avatar>
  <pdx-avatar size="lg" src="/avatars/person-4.svg" alt="LG"></pdx-avatar>
  <pdx-avatar size="xl" src="/avatars/person-4.svg" alt="XL"></pdx-avatar>
</div>
```

**Shape** — `shape="square"` for rounded rectangle. _(from the live demo)_

```html
<div class="demo-row">
  <pdx-avatar alt="Circle" size="lg"></pdx-avatar>
  <pdx-avatar alt="Square" size="lg" shape="square"></pdx-avatar>
  <pdx-avatar src="/avatars/person-5.svg" alt="Circle Img" size="lg"></pdx-avatar>
  <pdx-avatar src="/avatars/person-6.svg" alt="Square Img" size="lg" shape="square"></pdx-avatar>
</div>
```

**Avatar Group (Stacked)** — CSS overlap stack with `+N` overflow counter.

```html
<div class="avatar-stack">
  <pdx-avatar src="..." alt="User 1"></pdx-avatar>
  <pdx-avatar src="..." alt="User 2"></pdx-avatar>
  <span class="avatar-more" role="img" aria-label="5 more">+5</span>
</div>
```

**With Status Dot** — Combine with `.pdx-badge-anchor` + `<pdx-badge dot>` for presence indicators. Write the status next to the dot: a colour alone says nothing to a screen reader, or to someone who cannot tell green from red. Offline is `muted`, not `danger` — being away is not an error.

```html
<span class="pdx-badge-anchor">
  <pdx-avatar src="..." alt="Jane Doe"></pdx-avatar>
  <pdx-badge dot variant="success" label="Online"></pdx-badge>
</span>
<span class="pdx-txt-caption">Online</span>

<pdx-badge dot variant="muted"></pdx-badge>          <!-- offline -->
<pdx-badge dot variant="danger" pulse></pdx-badge>   <!-- busy -->
```

**Composition** _(from the live demo)_

```html
<div class="comp-card">
  <h3 class="pdx-txt-subheading">User Profile Card</h3>
  <div class="profile-card">
    <pdx-avatar src="/avatars/person-1.svg" alt="Jane Doe" size="xl"></pdx-avatar>
    <div>
      <span class="pdx-txt-subheading">Jane Doe</span>
      <span class="pdx-txt-small pdx-ink-muted">Product Designer</span>
    </div>
  </div>
</div>
<div class="comp-card">
  <h3 class="pdx-txt-subheading">Team Members</h3>
  <div class="team-list">
    <div class="team-row">
      <span class="pdx-badge-anchor">
        <pdx-avatar alt="Jane Doe" size="sm"></pdx-avatar>
        <pdx-badge label="Online" dot variant="success"></pdx-badge>
      </span>
      <div style="flex:1">
        <span class="pdx-txt-small">Jane Doe</span>
        <span class="pdx-txt-caption pdx-ink-muted">Designer</span>
      </div>
      <pdx-badge variant="success" value="Online" size="sm"></pdx-badge>
    </div>
    <div class="team-row">
      <span class="pdx-badge-anchor">
        <pdx-avatar alt="Alex Smith" size="sm"></pdx-avatar>
        <pdx-badge label="Away" dot variant="warning"></pdx-badge>
      </span>
      <div style="flex:1">
        <span class="pdx-txt-small">Alex Smith</span>
        <span class="pdx-txt-caption pdx-ink-muted">Developer</span>
      </div>
      <pdx-badge variant="warning" value="Away" size="sm"></pdx-badge>
    </div>
    <div class="team-row">
      <span class="pdx-badge-anchor">
        <pdx-avatar alt="Mary Kim" size="sm"></pdx-avatar>
        <pdx-badge label="Offline" dot variant="muted"></pdx-badge>
      </span>
      <div style="flex:1">
        <span class="pdx-txt-small">Mary Kim</span>
        <span class="pdx-txt-caption pdx-ink-muted">Manager</span>
      </div>
      <pdx-badge variant="outline" value="Offline" size="sm"></pdx-badge>
    </div>
  </div>
</div>
```

