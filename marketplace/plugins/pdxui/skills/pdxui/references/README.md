# Component catalogue — index by area

> 117 components across 8 areas. Each area is a **skill of its own**, `pdxui-<area>`
> (with its props/events catalogue). **Look here before building: the component almost always exists already.**

## Layout & shell — skill `pdxui-layout`

Page structure and application shell.

- `<pdx-affix>` — Pin an element while scrolling.
- `<pdx-app-layout>` — App shell: header, left/right sidebars, footer, and everything else as the main area.
- `<pdx-aspect-ratio>` — Lock content to a fixed ratio.
- `<pdx-col>` — A responsive grid column.
- `<pdx-masonry>` — A staggered, Pinterest-style grid.
- `<pdx-navbar>` — A top navigation bar.
- `<pdx-page-header>` — Breadcrumb, title and page actions.
- `<pdx-row>` — A responsive grid row.
- `<pdx-scroll-area>` — A styled, custom scrollbar region.
- `<pdx-scroll-spy>` — Highlight the section you’re viewing.
- `<pdx-sidebar>` — Collapsible side navigation.
- `<pdx-splitter>` — Resizable panes.
- `<pdx-toolbar>` — A row of grouped actions.

## Navigation & menus — skill `pdxui-navigation`

Navigation, menus, entries, pagination.

- `<pdx-bottom-nav>` — Mobile bottom navigation.
- `<pdx-breadcrumb>` — Show the path to here.
- `<pdx-command>` — A ⌘K command palette.
- `<pdx-context-menu>` — A right-click menu.
- `<pdx-dropdown-menu>` — A button that opens an action menu.
- `<pdx-fab>` — A floating action button.
- `<pdx-link>` — A link that navigates without a reload and marks itself active.
- `<pdx-menu>` — A list of actions.
- `<pdx-menubar>` — A desktop-style menu bar.
- `<pdx-nav-menu>` — A multi-level navigation menu.
- `<pdx-pagination>` — Page through long results.
- `<pdx-router-outlet>` — Where the page the current route matches is rendered.
- `<pdx-split-button>` — A primary action plus a menu.
- `<pdx-tabs>` — Switch between panels.

## Data display & data-bound — skill `pdxui-data`

Grids, charts, lists and data sources.

- `<pdx-bulk-actions>` — An action bar for the current selection.
- `<pdx-calendar>` — A month calendar surface.
- `<pdx-chart>` — Charts from your data.
- `<pdx-data-grid>` — Sortable, filterable, virtual data table.
- `<pdx-data-source>` — One reactive source of rows for grids, lists, selects, charts and forms.
- `<pdx-description-list>` — Key/value pairs, neatly aligned.
- `<pdx-empty-state>` — A friendly “nothing here yet”.
- `<pdx-entity-grid>` — A CRUD grid: create, edit, delete, bulk.
- `<pdx-filter-builder>` — Build complex filters visually.
- `<pdx-infinite-scroll>` — Load more as you scroll.
- `<pdx-list>` — Data-driven list with custom rows.
- `<pdx-relative-time>` — Auto-updating “3 days ago”.
- `<pdx-sortable-list>` — A list the user can put in another order, by dragging a row's handle or from the keyboard alone.

It emits `pdx-reorder` with the indices and never writes to `items`: the application applies the
move, so the array it owns stays the one source of truth.
- `<pdx-sparkline>` — A tiny inline trend chart.
- `<pdx-statistic>` — A big number with label and trend.
- `<pdx-timeline>` — A vertical sequence of events.
- `<pdx-tree>` — A hierarchy the user navigates.

## Form building — skill `pdxui-forms`

Form composition, sections, auto-form, wizard.

- `<pdx-auto-form>` — A form generated from a schema.
- `<pdx-field-group>` — Group related fields together.
- `<pdx-field-list>` — Repeatable arrays of fields.
- `<pdx-fieldset>` — A bordered, titled group of fields.
- `<pdx-form>` — Schema-driven form with validation.
- `<pdx-form-actions>` — The submit/cancel action bar.
- `<pdx-form-field>` — Label, control, hint and error in one.
- `<pdx-form-section>` — A titled section within a form.
- `<pdx-form-template>` — Render a whole form from a layout.
- `<pdx-inline-edit>` — Click text to edit it in place.
- `<pdx-input-group>` — Inputs joined with addons and buttons.
- `<pdx-json-editor>` — Edit nested JSON through a schema.
- `<pdx-wizard>` — A guided multi-step flow.

## Inputs (form controls) — skill `pdxui-inputs`

Every input and selection control.

- `<pdx-autocomplete>` — Suggestions as you type.
- `<pdx-cascader>` — Drill through nested options.
- `<pdx-checkbox>` — On/off box with an indeterminate state.
- `<pdx-checkbox-group>` — A managed set of checkboxes.
- `<pdx-color-picker>` — Choose a color visually.
- `<pdx-date-picker>` — Pick a date from a calendar.
- `<pdx-file-upload>` — Drag-and-drop or browse to upload.
- `<pdx-input>` — Text field with sizes, states and addons.
- `<pdx-masked-input>` — Input that enforces a fixed format.
- `<pdx-mention>` — Type @ to mention people.
- `<pdx-number-input>` — Numeric field with steppers and formatting.
- `<pdx-otp-input>` — One-time-code entry boxes.
- `<pdx-password-input>` — Password field with reveal and strength.
- `<pdx-pin-input>` — Segmented PIN entry.
- `<pdx-radio>` — Pick a single option from a set.
- `<pdx-radio-group>` — A managed set of radios.
- `<pdx-rating>` — Star rating with halves and tooltips.
- `<pdx-rich-text>` — A WYSIWYG editor.
- `<pdx-search-input>` — Search box with clear and shortcuts.
- `<pdx-segmented>` — A compact set of exclusive options.
- `<pdx-select>` — A searchable dropdown select.
- `<pdx-slider>` — Pick a number by dragging.
- `<pdx-switch>` — Toggle a setting on or off.
- `<pdx-tag-input>` — Type to add removable tags.
- `<pdx-textarea>` — Multi-line text input that can auto-grow.
- `<pdx-time-picker>` — Set hours and minutes.
- `<pdx-toggle>` — A pressable on/off button.
- `<pdx-toggle-group>` — Exclusive or multi-select set of toggles.
- `<pdx-transfer>` — Move items between two lists.
- `<pdx-tree-select>` — Select from a tree of options.

## Overlay & feedback — skill `pdxui-overlay`

Dialog, drawer, popover, toast, banner.

- `<pdx-alert-dialog>` — A confirm / cancel modal.
- `<pdx-banner>` — A persistent inline message.
- `<pdx-block-ui>` — Block a region while it’s busy.
- `<pdx-bottom-sheet>` — A panel that rises from the bottom.
- `<pdx-dialog>` — A modal window with focus trap.
- `<pdx-drawer>` — A panel that slides in from an edge.
- `<pdx-edit-drawer>` — A drawer holding a schema-driven form.
- `<pdx-overlay-outlet>` — A mount point for overlays.
- `<pdx-popover>` — Floating content anchored to a trigger.
- `<pdx-relation-picker>` — Pick existing rows for a relation.
- `<pdx-toast>` — Transient, stacked notifications.
- `<pdx-tooltip>` — A hint on hover or focus.

## Atoms & display — skill `pdxui-display`

Visual primitives and simple containers.

- `<pdx-accordion>` — Expandable, collapsible sections.
- `<pdx-avatar>` — User image or initials, any size.
- `<pdx-avatar-group>` — Stacked avatars with an overflow count.
- `<pdx-badge>` — A small count or status dot on anything.
- `<pdx-button>` — Clickable action — 9 variants, sizes, loading and icons.
- `<pdx-button-group>` — Joined buttons that read as one control.
- `<pdx-card>` — A surface for grouped content.
- `<pdx-carousel>` — A swipeable slideshow.
- `<pdx-chip>` — Compact, optionally removable tag.
- `<pdx-divider>` — A plain or labeled separating line.
- `<pdx-icon>` — Crisp SVG icons from a shared set.
- `<pdx-image>` — Lazy, responsive image with placeholder.
- `<pdx-kbd>` — Render keyboard keys and shortcuts.
- `<pdx-label>` — A form label tied to its control.
- `<pdx-progress>` — Linear progress, determinate or not.
- `<pdx-spinner>` — A lightweight loading indicator.

## Infrastructure — skill `pdxui-infra`

Provider, error boundary, plumbing.

- `<pdx-error-boundary>` — Catch and recover from render errors.
- `<pdx-provide>` — Provide context to a subtree.

## Strings the components render

Every key `@pdxui/ui` and `@pdxui/router` register, with its English default: `component-strings.md`.

## What core and the router export

Every value export of `@pdxui/core` and `@pdxui/router`, with its signature, its doc and the specifier
that imports it (`mount` is in `@pdxui/core/testing`, not the barrel): `api.md`. Generated by
`packages/site/scripts/gen-api.mjs`, the same page the site serves as docs/api.

